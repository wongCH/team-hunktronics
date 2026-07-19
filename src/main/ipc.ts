import { ipcMain, shell, BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, extname } from 'path';
import type {
  AgentConfig,
  AgentPipeline,
  AgentSchedule,
  AgentTask,
  ApiTrace,
  AppSettings,
  ChatRequest,
  ConnectionConfig,
  Conversation,
  LocalDataQuery,
  LocalDataResult,
  MemoryWriteCommand,
  ModelInfo,
  ProviderType,
  SkillDefinition,
  StartRunCommand,
  ToolActionRequest,
  TestResult
} from '@shared/types';
import { AGENT_ICONS, PROVIDER_META, SKILL_CATALOG } from '@shared/types';
import { IPC } from '@shared/ipc';
import type { DeviceFlowResult } from '@shared/ipc';
import type { Store } from './store';
import type { Vault } from './vault';
import { getProvider, type ProviderContext } from './providers';
import { startDeviceFlow, type DeviceFlowHandle } from './github/deviceFlow';
import { RunService } from './runService';
import type { MemoryService } from './memoryService';
import { nextScheduleRun, type ScheduleService } from './scheduleService';
import { validatePipeline, type PipelineService } from './pipelineService';
import { ToolPolicyBroker } from './toolPolicy';
import type { LlmWikiService } from './llmWikiService';

const VALID_TYPES: ProviderType[] = [
  'ollama',
  'openai',
  'anthropic',
  'github-models',
  'lm-studio',
  'openai-compatible',
  'copilot'
];

interface Deps {
  getWindow: () => BrowserWindow | null;
  store: Store;
  vault: Vault;
  memory: MemoryService;
  llmWiki: LlmWikiService;
}

function parseSkill(
  content: string,
  sourceFile: string
): Pick<SkillDefinition, 'id' | 'name' | 'description'> {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/);
  const fields = Object.fromEntries(
    (frontmatter?.[1] ?? '')
      .split(/\r?\n/)
      .map((line) => line.match(/^([\w-]+):\s*["']?(.*?)["']?\s*$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2]])
  );
  const fallbackName = basename(sourceFile, extname(sourceFile));
  const name = fields.name || content.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallbackName;
  const id = (fields.id || fields.name || fallbackName)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  if (!id || !name.trim()) throw new Error('Skill must have a valid name.');
  return {
    id,
    name: name.trim().slice(0, 160),
    description: (fields.description || `Imported from ${sourceFile}`).trim().slice(0, 500)
  };
}

export interface IpcRuntime {
  runService: RunService;
}

export function registerScheduleIpc(store: Store, scheduler: ScheduleService): void {
  function validateSchedule(input: unknown): AgentSchedule {
    if (!input || typeof input !== 'object') throw new Error('Invalid schedule payload.');
    const value = input as Partial<AgentSchedule>;
    const now = Date.now();
    const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : randomUUID();
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const agentId = typeof value.agentId === 'string' ? value.agentId.trim() : '';
    const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
    const cron = typeof value.cron === 'string' ? value.cron.trim() : '';
    const timeZone =
      typeof value.timeZone === 'string' && value.timeZone.trim() ? value.timeZone.trim() : 'UTC';
    if (!name || name.length > 240) throw new Error('A schedule name is required.');
    if (!agentId || agentId.length > 200) throw new Error('A scheduled agent is required.');
    if (!prompt || prompt.length > 100_000)
      throw new Error('A focused schedule prompt is required.');
    if (!cron || cron.length > 200) throw new Error('A cron expression is required.');
    const nextRunAt = nextScheduleRun(cron, timeZone, now);
    return {
      id,
      name,
      agentId,
      prompt,
      cron,
      timeZone,
      enabled: value.enabled !== false,
      maxAttempts: Math.max(1, Math.min(Math.trunc(value.maxAttempts ?? 1), 3)),
      nextRunAt,
      lastRunAt: typeof value.lastRunAt === 'number' ? value.lastRunAt : null,
      lastRunStatus: value.lastRunStatus ?? 'idle',
      lastError: typeof value.lastError === 'string' ? value.lastError.slice(0, 10_000) : null,
      conversationId: typeof value.conversationId === 'string' ? value.conversationId : null,
      currentRunId: typeof value.currentRunId === 'string' ? value.currentRunId : null,
      currentAttempt:
        typeof value.currentAttempt === 'number'
          ? Math.max(0, Math.min(Math.trunc(value.currentAttempt), 3))
          : 0,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
      updatedAt: now
    };
  }

  ipcMain.handle(IPC.schedulesList, () => store.listSchedules());
  ipcMain.handle(IPC.schedulesSave, (_event, input: unknown) =>
    store.saveSchedule(validateSchedule(input))
  );
  ipcMain.handle(IPC.schedulesDelete, (_event, id: string) => store.deleteSchedule(id));
  ipcMain.handle(IPC.schedulesRunNow, (_event, id: string) => scheduler.runNow(id));
}

export function registerPipelineIpc(store: Store, pipelines: PipelineService): void {
  function sanitizePipeline(input: unknown): AgentPipeline {
    if (!input || typeof input !== 'object') throw new Error('Invalid pipeline payload.');
    const value = input as Partial<AgentPipeline>;
    const now = Date.now();
    const pipeline: AgentPipeline = {
      id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : randomUUID(),
      name: typeof value.name === 'string' ? value.name.trim().slice(0, 240) : '',
      ownerAgentId:
        typeof value.ownerAgentId === 'string' ? value.ownerAgentId.trim().slice(0, 200) : '',
      stages: Array.isArray(value.stages)
        ? value.stages.slice(0, 8).map((stage) => ({
            id: typeof stage.id === 'string' && stage.id.trim() ? stage.id.trim() : randomUUID(),
            name: typeof stage.name === 'string' ? stage.name.trim().slice(0, 240) : '',
            agentId: typeof stage.agentId === 'string' ? stage.agentId.trim().slice(0, 200) : '',
            instructions:
              typeof stage.instructions === 'string'
                ? stage.instructions.trim().slice(0, 100_000)
                : '',
            expectedOutput:
              typeof stage.expectedOutput === 'string'
                ? stage.expectedOutput.trim().slice(0, 20_000)
                : ''
          }))
        : [],
      enabled: value.enabled !== false,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
      updatedAt: now
    };
    return pipeline;
  }

  ipcMain.handle(IPC.pipelinesList, () => store.listPipelines());
  ipcMain.handle(IPC.pipelinesSave, async (_event, input: unknown) => {
    const pipeline = sanitizePipeline(input);
    validatePipeline(pipeline, await store.listAgents());
    return store.savePipeline(pipeline);
  });
  ipcMain.handle(IPC.pipelinesDelete, (_event, id: string) => store.deletePipeline(id));
  ipcMain.handle(IPC.pipelinesStart, (_event, id: string, goal: string) =>
    pipelines.start(id, goal)
  );
  ipcMain.handle(IPC.pipelineExecutionsList, () => store.listPipelineExecutions());
  ipcMain.handle(IPC.artifactsList, () => store.listArtifacts());
}

export function registerIpc({ getWindow, store, vault, memory, llmWiki }: Deps): IpcRuntime {
  const activeStreams = new Map<string, AbortController>();
  let deviceFlow: DeviceFlowHandle | null = null;

  const send = (channel: string, payload: unknown): void => {
    getWindow()?.webContents.send(channel, payload);
  };

  async function buildContext(conn: ConnectionConfig): Promise<ProviderContext> {
    const meta = PROVIDER_META[conn.providerType];
    const apiKey = meta.needsKey || meta.supportsDeviceFlow ? await vault.getSecret(conn.id) : null;
    return { baseUrl: conn.baseUrl, apiKey };
  }

  function validateRunCommand(input: unknown): StartRunCommand {
    if (!input || typeof input !== 'object') throw new Error('Invalid run payload.');
    const command = input as Partial<StartRunCommand>;
    const conversationId =
      typeof command.conversationId === 'string' ? command.conversationId.trim() : '';
    const userContent = typeof command.userContent === 'string' ? command.userContent.trim() : '';
    const idempotencyKey =
      typeof command.idempotencyKey === 'string' ? command.idempotencyKey.trim() : '';
    const agentId = typeof command.agentId === 'string' ? command.agentId.trim() : undefined;
    if (!conversationId || conversationId.length > 200) throw new Error('Invalid conversation id.');
    if (!userContent || userContent.length > 1_000_000) throw new Error('Invalid run input.');
    if (!idempotencyKey || idempotencyKey.length > 200) throw new Error('Invalid idempotency key.');
    if (command.agentId !== undefined && !agentId) throw new Error('Invalid agent id.');
    return { conversationId, userContent, idempotencyKey, agentId };
  }

  const runService = new RunService({
    getConversation: (id) => store.getConversation(id),
    saveConversation: (conversation) => store.saveConversation(conversation),
    getAgent: (id) => store.getAgent(id),
    listAgents: () => store.listAgents(),
    getConnection: (id) => store.getConnection(id),
    getDefaultTarget: async (query) => {
      const settings = await store.getSettings();
      return {
        connectionId: settings.activeConnectionId,
        model: settings.activeModel,
        llmWikiContext: await llmWiki.loadContext(settings.llmWikiPath, query)
      };
    },
    getMemory: (agentId, query) => memory.getRunContext(agentId, query ?? ''),
    getSkills: async (skillIds) => {
      const skills = await store.listSkills();
      return skillIds
        .map((id) => {
          const uploaded = skills.find((skill) => skill.id === id);
          if (uploaded) return uploaded;
          const builtIn = SKILL_CATALOG.find((skill) => skill.id === id);
          return builtIn ? { name: builtIn.name, instructions: builtIn.description } : null;
        })
        .filter((skill): skill is { name: string; instructions: string } => Boolean(skill));
    },
    execute: async ({ run, connection, model, messages, signal, onChunk }) => {
      if (connection.providerType === 'copilot') {
        const settings = await store.getSettings();
        if (!settings.experimentalCopilot) {
          throw new Error(
            'Enable experimental Copilot support in Settings to use this connection.'
          );
        }
      }

      const provider = getProvider(connection.providerType);
      const agent = run.agentId ? await store.getAgent(run.agentId) : undefined;
      const startedAt = Date.now();
      let trace: ApiTrace = {
        id: randomUUID(),
        streamId: run.streamId,
        providerType: connection.providerType,
        connectionId: connection.id,
        model,
        request: {
          messageCount: messages.length,
          characterCount: messages.reduce((total, message) => total + message.content.length, 0),
          hasSystemContext: messages.some((message) => message.role === 'system'),
          startedAt
        },
        response: {
          preview: '',
          characterCount: 0,
          truncated: false,
          chunks: 0,
          doneAt: null,
          error: null,
          cancelled: false
        },
        context: {
          source: agent ? 'agent' : 'chat',
          agentId: agent?.id ?? null,
          agentName: agent?.name ?? null
        },
        status: 'streaming',
        createdAt: startedAt,
        updatedAt: startedAt
      };
      await store.saveApiTrace(trace);
      send(IPC.traceUpdate, { trace });

      try {
        await provider.streamChat(
          await buildContext(connection),
          model,
          messages,
          undefined,
          signal,
          {
            onChunk: (delta) => {
              trace = {
                ...trace,
                response: {
                  ...trace.response,
                  preview: (trace.response.preview + delta).slice(0, 2_000),
                  characterCount: trace.response.characterCount + delta.length,
                  truncated: trace.response.characterCount + delta.length > 2_000,
                  chunks: trace.response.chunks + 1
                },
                updatedAt: Date.now()
              };
              onChunk(delta);
              send(IPC.traceUpdate, { trace });
            }
          }
        );
        const doneAt = Date.now();
        trace = {
          ...trace,
          status: 'done',
          response: { ...trace.response, doneAt },
          updatedAt: doneAt
        };
        await store.saveApiTrace(trace);
        send(IPC.traceUpdate, { trace });
      } catch (error) {
        const doneAt = Date.now();
        const cancelled = signal.aborted || (error as Error).name === 'AbortError';
        trace = {
          ...trace,
          status: cancelled ? 'cancelled' : 'error',
          response: {
            ...trace.response,
            doneAt,
            error: cancelled ? 'Generation stopped.' : (error as Error).message,
            cancelled
          },
          updatedAt: doneAt
        };
        await store.saveApiTrace(trace);
        send(IPC.traceUpdate, { trace });
        throw error;
      }
    },
    onEvent: (event) => {
      send(IPC.runEvent, event);
      if (
        event.type !== 'state' ||
        !['completed', 'failed', 'cancelled'].includes(event.run.status)
      ) {
        return;
      }
      void store.listTasks().then(async (tasks) => {
        const task = tasks.find(
          (item) =>
            item.currentRunId === event.run.id ||
            (item.conversationId === event.run.conversationId && item.status === 'in-progress')
        );
        if (!task) return;
        await store.saveTask({
          ...task,
          status: event.run.status === 'completed' ? 'review' : task.status,
          currentRunId: null,
          lastError: event.run.status === 'completed' ? null : event.run.error,
          updatedAt: Date.now()
        });
      });
    }
  });
  const toolPolicy = new ToolPolicyBroker({
    getAgent: (id) => store.getAgent(id),
    saveAction: (action) => store.saveToolAction(action),
    getApproval: (id) => store.getApproval(id),
    saveApproval: (approval) => store.saveApproval(approval)
  });

  function validateConnection(input: unknown): ConnectionConfig {
    const c = input as Partial<ConnectionConfig>;
    if (!c || typeof c !== 'object') throw new Error('Invalid connection payload.');
    if (!c.providerType || !VALID_TYPES.includes(c.providerType)) {
      throw new Error('Invalid provider type.');
    }
    const label = (c.label ?? '').toString().trim();
    if (!label) throw new Error('A connection name is required.');
    const now = Date.now();
    return {
      id: c.id && typeof c.id === 'string' ? c.id : randomUUID(),
      providerType: c.providerType,
      label: label.slice(0, 120),
      baseUrl: c.baseUrl ? c.baseUrl.toString().trim() : undefined,
      defaultModel: c.defaultModel ? c.defaultModel.toString().trim() : undefined,
      hasKey: false,
      createdAt: c.createdAt ?? now,
      updatedAt: now
    };
  }

  function validateAgent(input: unknown): AgentConfig {
    if (!input || typeof input !== 'object') throw new Error('Invalid agent payload.');
    const value = input as Partial<AgentConfig>;
    const validRoles = ['orchestrator', 'team-lead', 'specialist'];
    const validAutonomy = ['draft', 'assist', 'autonomous'];
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw new Error('Invalid agent id.');
    if (!name || name.length > 120) throw new Error('An agent name is required.');
    if (!title || title.length > 160) throw new Error('An agent title is required.');
    if (!value.role || !validRoles.includes(value.role)) throw new Error('Invalid agent role.');
    if (!value.autonomy || !validAutonomy.includes(value.autonomy)) {
      throw new Error('Invalid agent autonomy.');
    }
    const reportsTo = typeof value.reportsTo === 'string' ? value.reportsTo.trim() : null;
    const now = Date.now();
    return {
      id,
      name,
      icon: AGENT_ICONS.some((option) => option.value === value.icon) ? value.icon : undefined,
      title,
      role: value.role,
      reportsTo: reportsTo || null,
      connectionId: typeof value.connectionId === 'string' ? value.connectionId : null,
      model: typeof value.model === 'string' ? value.model : null,
      soul: typeof value.soul === 'string' ? value.soul.slice(0, 500_000) : '',
      soulPath: `agents/${id}/SOUL.md`,
      capabilities:
        typeof value.capabilities === 'string'
          ? value.capabilities.trim().slice(0, 500)
          : undefined,
      tools: Array.isArray(value.tools)
        ? value.tools.filter((item): item is string => typeof item === 'string').slice(0, 100)
        : [],
      skills: Array.isArray(value.skills)
        ? value.skills.filter((item): item is string => typeof item === 'string').slice(0, 100)
        : [],
      autonomy: value.autonomy,
      delegatesTo: [],
      archived: value.archived === true,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
      updatedAt: now
    };
  }

  function validateTask(input: unknown): AgentTask {
    if (!input || typeof input !== 'object') throw new Error('Invalid task payload.');
    const value = input as Partial<AgentTask>;
    const validStatuses = ['backlog', 'in-progress', 'review', 'done'];
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : randomUUID();
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    if (!title || title.length > 240) throw new Error('A task title is required.');
    if (!value.status || !validStatuses.includes(value.status))
      throw new Error('Invalid task status.');
    if (!value.priority || !validPriorities.includes(value.priority)) {
      throw new Error('Invalid task priority.');
    }
    const now = Date.now();
    return {
      id,
      title,
      description: typeof value.description === 'string' ? value.description.slice(0, 100_000) : '',
      status: value.status,
      priority: value.priority,
      agentId: typeof value.agentId === 'string' && value.agentId ? value.agentId : null,
      conversationId:
        typeof value.conversationId === 'string' && value.conversationId
          ? value.conversationId
          : null,
      currentRunId:
        typeof value.currentRunId === 'string' && value.currentRunId ? value.currentRunId : null,
      lastError: typeof value.lastError === 'string' ? value.lastError.slice(0, 10_000) : null,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
      updatedAt: now
    };
  }

  // ---- Vault status ----
  ipcMain.handle(IPC.vaultStatus, () => ({
    available: vault.isAvailable(),
    backend: vault.backendName()
  }));

  // ---- Connections ----
  ipcMain.handle(IPC.connectionsList, () => store.listConnections());

  ipcMain.handle(IPC.connectionsUpsert, async (_e, input: unknown) => {
    const conn = validateConnection(input);
    conn.hasKey = await vault.hasSecret(conn.id);
    return store.upsertConnection(conn);
  });

  ipcMain.handle(IPC.connectionsRemove, async (_e, id: string) => {
    await vault.clearSecret(id);
    return store.removeConnection(id);
  });

  ipcMain.handle(IPC.connectionsTest, async (_e, id: string): Promise<TestResult> => {
    try {
      const conn = await store.getConnection(id);
      if (!conn) return { ok: false, message: 'Connection not found.' };
      const provider = getProvider(conn.providerType);
      const models = await provider.listModels(await buildContext(conn));
      return {
        ok: true,
        message: models.length
          ? `Connected — ${models.length} model(s) available.`
          : 'Connected. No model list returned; you can enter a model name manually.',
        models
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  });

  // ---- Secrets (write-only from renderer's perspective) ----
  ipcMain.handle(IPC.secretsSet, async (_e, id: string, secret: string) => {
    if (!secret || !secret.trim()) throw new Error('Secret cannot be empty.');
    await vault.setSecret(id, secret.trim());
    const conn = await store.getConnection(id);
    if (conn) await store.upsertConnection({ ...conn, hasKey: true, updatedAt: Date.now() });
    return { ok: true };
  });

  ipcMain.handle(IPC.secretsClear, async (_e, id: string) => {
    await vault.clearSecret(id);
    const conn = await store.getConnection(id);
    if (conn) await store.upsertConnection({ ...conn, hasKey: false, updatedAt: Date.now() });
    return { ok: true };
  });

  ipcMain.handle(IPC.secretsHas, (_e, id: string) => vault.hasSecret(id));

  // ---- Models ----
  ipcMain.handle(IPC.modelsList, async (_e, id: string): Promise<ModelInfo[]> => {
    const conn = await store.getConnection(id);
    if (!conn) throw new Error('Connection not found.');
    const provider = getProvider(conn.providerType);
    return provider.listModels(await buildContext(conn));
  });

  // ---- API traces ----
  ipcMain.handle(IPC.tracesList, () => store.listApiTraces());
  ipcMain.handle(IPC.tracesClear, () => store.clearApiTraces());
  ipcMain.handle(IPC.tracesClearScope, (_event, scope: { agentId?: string; runId?: string }) =>
    store.clearApiTracesScope(scope ?? {})
  );

  // ---- Chat (streaming) ----
  ipcMain.handle(IPC.chatSend, async (_e, req: ChatRequest): Promise<{ streamId: string }> => {
    const conn = await store.getConnection(req.connectionId);
    if (!conn) throw new Error('Connection not found.');
    if (!req.model) throw new Error('No model selected.');
    if (conn.providerType === 'copilot') {
      const settings = await store.getSettings();
      if (!settings.experimentalCopilot) {
        throw new Error('Enable experimental Copilot support in Settings to use this connection.');
      }
    }

    const provider = getProvider(conn.providerType);
    const ctx = await buildContext(conn);
    const streamId = randomUUID();
    const controller = new AbortController();
    activeStreams.set(streamId, controller);
    const startedAt = Date.now();
    const traceBase: ApiTrace = {
      id: randomUUID(),
      streamId,
      providerType: conn.providerType,
      connectionId: conn.id,
      model: req.model,
      request: {
        messageCount: req.messages.length,
        characterCount: req.messages.reduce((total, message) => total + message.content.length, 0),
        hasSystemContext: req.messages.some((message) => message.role === 'system'),
        params: req.params,
        startedAt
      },
      response: {
        preview: '',
        characterCount: 0,
        truncated: false,
        chunks: 0,
        doneAt: null,
        error: null,
        cancelled: false
      },
      context: {
        source: req.traceContext?.source ?? 'chat',
        agentId: req.traceContext?.agentId ?? null,
        agentName: req.traceContext?.agentName ?? null
      },
      status: 'streaming',
      createdAt: startedAt,
      updatedAt: startedAt
    };
    let trace = traceBase;
    let traceWriteQueue = Promise.resolve();
    const queueTrace = (next: ApiTrace): Promise<void> => {
      trace = next;
      traceWriteQueue = traceWriteQueue.then(async () => {
        await store.saveApiTrace(next);
        send(IPC.traceUpdate, { trace: next });
      });
      return traceWriteQueue;
    };
    await queueTrace(trace);

    // Run in the background; stream chunks over IPC events.
    void (async () => {
      try {
        await provider.streamChat(ctx, req.model, req.messages, req.params, controller.signal, {
          onChunk: (delta) => {
            send(IPC.chatChunk, { streamId, delta });
            void queueTrace({
              ...trace,
              response: {
                ...trace.response,
                preview: (trace.response.preview + delta).slice(0, 2_000),
                characterCount: trace.response.characterCount + delta.length,
                truncated: trace.response.characterCount + delta.length > 2_000,
                chunks: trace.response.chunks + 1
              },
              updatedAt: Date.now()
            });
          }
        });
        const doneAt = Date.now();
        await queueTrace({
          ...trace,
          status: 'done',
          response: {
            ...trace.response,
            doneAt
          },
          updatedAt: doneAt
        });
        send(IPC.chatDone, { streamId });
      } catch (err) {
        const message =
          (err as Error)?.name === 'AbortError'
            ? 'Generation stopped.'
            : (err as Error).message || 'Unknown error.';
        const doneAt = Date.now();
        await queueTrace({
          ...trace,
          status: (err as Error)?.name === 'AbortError' ? 'cancelled' : 'error',
          response: {
            ...trace.response,
            doneAt,
            error: message,
            cancelled: (err as Error)?.name === 'AbortError'
          },
          updatedAt: doneAt
        });
        send(IPC.chatError, { streamId, message });
      } finally {
        activeStreams.delete(streamId);
      }
    })();

    return { streamId };
  });

  ipcMain.handle(IPC.chatCancel, (_e, streamId: string) => {
    activeStreams.get(streamId)?.abort();
    activeStreams.delete(streamId);
    return { ok: true };
  });

  // ---- Trusted runs (main-owned prompt assembly and persistence) ----
  ipcMain.handle(IPC.runsStart, (_e, input: unknown) =>
    runService.start(validateRunCommand(input))
  );
  ipcMain.handle(IPC.runsCancel, (_e, runId: string) => ({ ok: runService.cancel(runId) }));
  ipcMain.handle(IPC.runsListActive, () => runService.listActive());

  // ---- Conversations ----
  ipcMain.handle(IPC.conversationsList, () => store.listConversations());
  ipcMain.handle(IPC.conversationsSave, (_e, conv: Conversation) => store.saveConversation(conv));
  ipcMain.handle(IPC.conversationsDelete, (_e, id: string) => store.deleteConversation(id));

  // ---- Agents ----
  ipcMain.handle(IPC.agentsList, () => store.listAgents());
  ipcMain.handle(IPC.agentsGet, (_e, id: string) => store.getAgent(id));
  ipcMain.handle(IPC.agentsSave, (_e, input: unknown) => store.saveAgent(validateAgent(input)));
  ipcMain.handle(IPC.agentsDelete, (_e, id: string) => {
    if (runService.listActive().some((run) => run.agentId === id)) {
      throw new Error('Stop the active agent run before archiving this agent.');
    }
    return store.deleteAgent(id);
  });

  // ---- Skills library ----
  ipcMain.handle(IPC.skillsList, () => store.listSkills());
  ipcMain.handle(IPC.skillsImport, async () => {
    const options: OpenDialogOptions = {
      title: 'Import skill Markdown',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    };
    const window = getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) return store.listSkills();
    for (const filePath of result.filePaths) {
      const stat = await fs.stat(filePath);
      if (stat.size > 100_000)
        throw new Error(`${basename(filePath)} exceeds the 100 KB skill limit.`);
      if (!['.md', '.markdown'].includes(extname(filePath).toLocaleLowerCase())) {
        throw new Error('Skills must be Markdown files.');
      }
      const instructions = await fs.readFile(filePath, 'utf8');
      const parsed = parseSkill(instructions, basename(filePath));
      const existing = (await store.listSkills()).find((skill) => skill.id === parsed.id);
      const now = Date.now();
      await store.saveSkill({
        ...parsed,
        instructions,
        sourceFile: basename(filePath),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    }
    return store.listSkills();
  });
  ipcMain.handle(IPC.skillsDelete, async (_e, id: string) => {
    const agents = await store.listAgents();
    for (const agent of agents.filter((item) => item.skills.includes(id))) {
      const hydrated = await store.getAgent(agent.id);
      if (hydrated) {
        await store.saveAgent({
          ...hydrated,
          skills: hydrated.skills.filter((skill) => skill !== id)
        });
      }
    }
    return store.deleteSkill(id);
  });

  // ---- Human-owned llm-wiki ----
  ipcMain.handle(IPC.llmWikiStatus, async () => {
    const settings = await store.getSettings();
    return llmWiki.status(settings.llmWikiPath);
  });
  ipcMain.handle(IPC.llmWikiReferenceFound, async () => {
    const settings = await store.getSettings();
    const status = await llmWiki.status(null);
    if (status.state !== 'found' || !status.path)
      throw new Error('No existing llm-wiki vault was found.');
    await store.setSettings({ ...settings, llmWikiPath: status.path });
    return llmWiki.status(status.path);
  });
  ipcMain.handle(IPC.llmWikiChoose, async () => {
    const options: OpenDialogOptions = {
      title: 'Choose human llm-wiki vault',
      properties: ['openDirectory']
    };
    const window = getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return llmWiki.status((await store.getSettings()).llmWikiPath);
    }
    const status = await llmWiki.inspect(result.filePaths[0]);
    if (status.state !== 'ready' || !status.path) throw new Error(status.message);
    await store.setSettings({ ...(await store.getSettings()), llmWikiPath: status.path });
    return status;
  });
  ipcMain.handle(IPC.llmWikiCreate, async () => {
    const options: OpenDialogOptions = {
      title: 'Choose where to create LLM-Vault',
      properties: ['openDirectory', 'createDirectory']
    };
    const window = getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return llmWiki.status((await store.getSettings()).llmWikiPath);
    }
    const status = await llmWiki.create(result.filePaths[0]);
    if (!status.path) throw new Error(status.message);
    await store.setSettings({ ...(await store.getSettings()), llmWikiPath: status.path });
    return status;
  });
  ipcMain.handle(IPC.llmWikiRemove, async () => {
    await store.setSettings({ ...(await store.getSettings()), llmWikiPath: null });
    return llmWiki.status(null);
  });

  // ---- Managed memory ----
  ipcMain.handle(IPC.memoryList, () => memory.list());
  ipcMain.handle(IPC.memoryWrite, (_e, command: MemoryWriteCommand) => memory.write(command));
  ipcMain.handle(IPC.memorySearch, (_e, query: string, limit?: number) => {
    if (typeof query !== 'string' || query.length > 10_000)
      throw new Error('Invalid memory search.');
    return memory.search(query, limit);
  });
  ipcMain.handle(IPC.memoryHealth, () => memory.health());
  ipcMain.handle(IPC.memoryCompressPropose, (_event, agentId: string) =>
    memory.proposeCompression(agentId)
  );
  ipcMain.handle(IPC.memoryCompressApply, (_event, proposalId: string) =>
    memory.applyCompression(proposalId)
  );

  // ---- Tasks ----
  ipcMain.handle(IPC.tasksList, () => store.listTasks());
  ipcMain.handle(IPC.tasksSave, (_e, input: unknown) => store.saveTask(validateTask(input)));
  ipcMain.handle(IPC.tasksDelete, (_e, id: string) => store.deleteTask(id));
  ipcMain.handle(IPC.tasksStart, async (_e, taskId: string) => {
    const task = await store.getTask(taskId);
    if (!task) throw new Error('Task not found.');
    if (!task.agentId) throw new Error('Assign an agent before starting work.');
    const agent = await store.getAgent(task.agentId);
    if (!agent) throw new Error('Assigned agent not found.');
    if (!agent.connectionId || !agent.model)
      throw new Error('Configure the assigned agent model first.');

    let conversationId = task.conversationId;
    if (!conversationId) {
      conversationId = randomUUID();
      const now = Date.now();
      await store.saveConversation({
        id: conversationId,
        title: task.title,
        connectionId: agent.connectionId,
        model: agent.model,
        messages: [],
        createdAt: now,
        updatedAt: now
      });
    }
    const pending: AgentTask = {
      ...task,
      status: 'in-progress',
      conversationId,
      currentRunId: null,
      lastError: null,
      updatedAt: Date.now()
    };
    await store.saveTask(pending);
    const run = await runService.start({
      conversationId,
      agentId: agent.id,
      userContent: `Complete this task and return a review-ready result.\n\nTitle: ${task.title}\n\nDescription:\n${task.description || 'No additional description.'}`,
      idempotencyKey: `task-${task.id}-${randomUUID()}`
    });
    const latest = await store.getTask(task.id);
    if (!latest || latest.status !== 'in-progress') return { task: latest ?? pending, run };
    const updated = { ...latest, currentRunId: run.id, updatedAt: Date.now() };
    await store.saveTask(updated);
    return { task: updated, run };
  });

  // ---- Tool policy and approvals ----
  ipcMain.handle(IPC.toolActionsList, () => store.listToolActions());
  ipcMain.handle(IPC.toolActionsAuthorize, (_event, request: ToolActionRequest) =>
    toolPolicy.authorize(request)
  );
  ipcMain.handle(IPC.approvalsList, () => store.listApprovals());
  ipcMain.handle(IPC.approvalsDecide, (_event, approvalId: string, approved: boolean) =>
    toolPolicy.decide(approvalId, approved)
  );

  // ---- Local data explorer (read-only; vault is deliberately excluded) ----
  ipcMain.handle(IPC.localDataQuery, (_e, query: LocalDataQuery): Promise<LocalDataResult> =>
    store.queryLocalData(query)
  );

  // ---- Settings ----
  ipcMain.handle(IPC.settingsGet, () => store.getSettings());
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<AppSettings>) => {
    delete patch.llmWikiPath;
    return store.setSettings(patch);
  });

  // ---- GitHub device flow ----
  ipcMain.handle(
    IPC.githubStartDeviceFlow,
    async (_e, connectionId: string, scope?: string): Promise<DeviceFlowResult> => {
      try {
        const conn = await store.getConnection(connectionId);
        if (!conn) return { ok: false, stored: false, message: 'Connection not found.' };
        const settings = await store.getSettings();

        deviceFlow = startDeviceFlow({
          clientId: settings.githubClientId,
          scope: scope ?? 'read:user',
          onCode: (code) => send(IPC.githubDeviceCode, code)
        });

        const token = await deviceFlow.promise;
        deviceFlow = null;
        await vault.setSecret(connectionId, token);
        await store.upsertConnection({ ...conn, hasKey: true, updatedAt: Date.now() });
        return { ok: true, stored: true, message: 'Signed in with GitHub.' };
      } catch (err) {
        deviceFlow = null;
        return { ok: false, stored: false, message: (err as Error).message };
      }
    }
  );

  ipcMain.handle(IPC.githubCancelDeviceFlow, () => {
    deviceFlow?.cancel();
    deviceFlow = null;
    return { ok: true };
  });

  // ---- Shell ----
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { ok: true };
  });

  return { runService };
}
