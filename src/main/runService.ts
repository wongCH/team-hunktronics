import { randomUUID } from 'crypto';
import type {
  AgentConfig,
  ChatMessage,
  ConnectionConfig,
  Conversation,
  RunEvent,
  RunStatus,
  RunView,
  StartRunCommand
} from '@shared/types';
import { assembleContext } from './contextAssembler';

export interface RunExecution {
  run: RunView;
  connection: ConnectionConfig;
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onChunk: (delta: string) => void;
}

export interface RunServiceDeps {
  getConversation: (id: string) => Promise<Conversation | undefined>;
  saveConversation: (conversation: Conversation) => Promise<unknown>;
  getAgent: (id: string) => Promise<AgentConfig | undefined>;
  getConnection: (id: string) => Promise<ConnectionConfig | undefined>;
  getDefaultTarget: () => Promise<{
    connectionId: string | null;
    model: string | null;
    humanIdentity?: string;
  }>;
  getMemory: (agentId?: string) => Promise<{ teamMemory: string; agentMemory: string }>;
  getSkills: (skillIds: string[]) => Promise<Array<{ name: string; instructions: string }>>;
  execute: (execution: RunExecution) => Promise<void>;
  onEvent: (event: RunEvent) => void;
  createId?: () => string;
  now?: () => number;
}

interface ActiveRun {
  controller: AbortController;
  view: RunView;
}

function replaceAssistantDraft(conversation: Conversation, content: string): Conversation {
  const messages = [...conversation.messages];
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') throw new Error('Conversation has no assistant draft.');
  messages[messages.length - 1] = { ...last, content };
  return { ...conversation, messages, updatedAt: Date.now() };
}

export class RunService {
  private readonly active = new Map<string, ActiveRun>();
  private readonly byIdempotencyKey = new Map<string, RunView>();
  private readonly listeners = new Set<(event: RunEvent) => void>();
  private readonly createId: () => string;
  private readonly now: () => number;

  constructor(private readonly deps: RunServiceDeps) {
    this.createId = deps.createId ?? randomUUID;
    this.now = deps.now ?? Date.now;
  }

  async start(command: StartRunCommand): Promise<RunView> {
    const userContent = command.userContent.trim();
    if (!command.conversationId) throw new Error('A conversation is required.');
    if (!userContent) throw new Error('Run input cannot be empty.');
    if (!command.idempotencyKey) throw new Error('An idempotency key is required.');

    const existing = this.byIdempotencyKey.get(command.idempotencyKey);
    if (existing) return existing;

    const conversation = await this.deps.getConversation(command.conversationId);
    if (!conversation) throw new Error('Conversation not found.');

    const agent = command.agentId ? await this.deps.getAgent(command.agentId) : undefined;
    if (command.agentId && !agent) throw new Error('Agent not found.');

    const defaultTarget = await this.deps.getDefaultTarget();
    const connectionId = agent
      ? agent.connectionId
      : defaultTarget.connectionId ?? conversation.connectionId;
    const model = agent ? agent.model : defaultTarget.model ?? conversation.model;
    if (!connectionId) throw new Error('No connection selected.');
    if (!model) throw new Error('No model selected.');

    const connection = await this.deps.getConnection(connectionId);
    if (!connection) throw new Error('Connection not found.');

    const createdAt = this.now();
    const run: RunView = {
      id: this.createId(),
      streamId: this.createId(),
      idempotencyKey: command.idempotencyKey,
      conversationId: conversation.id,
      agentId: agent?.id ?? null,
      connectionId,
      model,
      status: 'queued',
      error: null,
      createdAt,
      updatedAt: createdAt
    };
    this.byIdempotencyKey.set(command.idempotencyKey, run);
    this.emit({ type: 'state', run });

    const memory = await this.deps.getMemory(agent?.id);
    const skills = await this.deps.getSkills(agent?.skills ?? []);
    const outbound = assembleContext({
      identity: agent?.soul,
      humanIdentity: defaultTarget.humanIdentity,
      skills,
      teamMemory: memory.teamMemory,
      agentMemory: memory.agentMemory,
      history: conversation.messages,
      userContent
    }).messages;
    let nextConversation: Conversation = {
      ...conversation,
      title: conversation.messages.length === 0 ? userContent.slice(0, 48) : conversation.title,
      connectionId,
      model,
      messages: [
        ...conversation.messages,
        { role: 'user', content: userContent },
        { role: 'assistant', content: '' }
      ],
      updatedAt: createdAt
    };
    await this.deps.saveConversation(nextConversation);

    const controller = new AbortController();
    this.active.set(run.id, { controller, view: run });

    void this.execute(run, connection, outbound, nextConversation, controller);
    return run;
  }

  cancel(runId: string): boolean {
    const active = this.active.get(runId);
    if (!active) return false;
    active.controller.abort();
    return true;
  }

  subscribe(listener: (event: RunEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async execute(
    initial: RunView,
    connection: ConnectionConfig,
    messages: ChatMessage[],
    conversation: Conversation,
    controller: AbortController
  ): Promise<void> {
    let run = this.update(initial, 'running');
    let response = '';
    try {
      await this.deps.execute({
        run,
        connection,
        model: run.model,
        messages,
        signal: controller.signal,
        onChunk: (delta) => {
          response += delta;
          this.emit({ type: 'chunk', run, delta });
        }
      });
      conversation = replaceAssistantDraft(conversation, response);
      await this.deps.saveConversation(conversation);
      run = this.update(run, 'completed');
    } catch (error) {
      const cancelled = controller.signal.aborted || (error as Error).name === 'AbortError';
      const message = cancelled ? 'Generation stopped.' : (error as Error).message || 'Unknown error.';
      conversation = replaceAssistantDraft(conversation, response || `_⚠️ ${message}_`);
      await this.deps.saveConversation(conversation);
      run = this.update(run, cancelled ? 'cancelled' : 'failed', message);
    } finally {
      this.active.delete(initial.id);
    }
  }

  private update(run: RunView, status: RunStatus, error: string | null = null): RunView {
    const next = { ...run, status, error, updatedAt: this.now() };
    this.byIdempotencyKey.set(next.idempotencyKey, next);
    const active = this.active.get(run.id);
    if (active) active.view = next;
    this.emit({ type: 'state', run: next });
    return next;
  }

  private emit(event: RunEvent): void {
    this.deps.onEvent(event);
    this.listeners.forEach((listener) => listener(event));
  }
}