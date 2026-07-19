import { randomUUID } from 'crypto';
import type {
  AgentConfig,
  AgentPipeline,
  Conversation,
  PipelineExecution,
  RunArtifact,
  RunEvent,
  RunView
} from '@shared/types';

export interface PipelineServiceDeps {
  getPipeline: (id: string) => Promise<AgentPipeline | undefined>;
  listExecutions: () => Promise<PipelineExecution[]>;
  getExecution: (id: string) => Promise<PipelineExecution | undefined>;
  saveExecution: (execution: PipelineExecution) => Promise<unknown>;
  listArtifacts: () => Promise<RunArtifact[]>;
  saveArtifact: (artifact: RunArtifact) => Promise<unknown>;
  listAgents: () => Promise<AgentConfig[]>;
  saveConversation: (conversation: Conversation) => Promise<unknown>;
  getConversation: (id: string) => Promise<Conversation | undefined>;
  startRun: (command: {
    conversationId: string;
    agentId: string;
    userContent: string;
    idempotencyKey: string;
  }) => Promise<RunView>;
  createId?: () => string;
  now?: () => number;
}

export function validatePipeline(pipeline: AgentPipeline, agents: AgentConfig[]): void {
  if (!pipeline.name.trim()) throw new Error('A pipeline name is required.');
  if (pipeline.stages.length < 1 || pipeline.stages.length > 8) {
    throw new Error('Pipelines require between one and eight focused stages.');
  }
  const owner = agents.find((agent) => agent.id === pipeline.ownerAgentId && !agent.archived);
  if (!owner || owner.role === 'specialist') throw new Error('A pipeline owner must be an orchestrator or team lead.');
  const seenStageIds = new Set<string>();
  for (const stage of pipeline.stages) {
    if (seenStageIds.has(stage.id)) throw new Error('Pipeline stage ids must be unique.');
    seenStageIds.add(stage.id);
    if (!stage.name.trim() || !stage.instructions.trim() || !stage.expectedOutput.trim()) {
      throw new Error('Every pipeline stage needs a name, instructions, and output contract.');
    }
    const stageAgent = agents.find((agent) => agent.id === stage.agentId && !agent.archived);
    if (!stageAgent) throw new Error(`Stage ${stage.name} references an unknown agent.`);
    if (stageAgent.reportsTo !== owner.id) {
      throw new Error(`Stage agent ${stageAgent.name} must report directly to the pipeline owner.`);
    }
  }
}

export class PipelineService {
  private readonly createId: () => string;
  private readonly now: () => number;

  constructor(private readonly deps: PipelineServiceDeps) {
    this.createId = deps.createId ?? randomUUID;
    this.now = deps.now ?? Date.now;
  }

  async start(pipelineId: string, goal: string): Promise<PipelineExecution> {
    const pipeline = await this.deps.getPipeline(pipelineId);
    if (!pipeline || !pipeline.enabled) throw new Error('Pipeline not found or disabled.');
    validatePipeline(pipeline, await this.deps.listAgents());
    if (!goal.trim()) throw new Error('A pipeline goal is required.');
    const now = this.now();
    const execution: PipelineExecution = {
      id: this.createId(),
      pipelineId,
      goal: goal.trim(),
      status: 'queued',
      currentStageIndex: 0,
      currentRunId: null,
      artifactIds: [],
      error: null,
      createdAt: now,
      updatedAt: now
    };
    await this.deps.saveExecution(execution);
    return this.startStage(execution, pipeline);
  }

  async handleRunEvent(event: RunEvent): Promise<void> {
    if (event.type !== 'state' || !['completed', 'failed', 'cancelled'].includes(event.run.status)) return;
    const executions = (await this.deps.listExecutions()).filter((item) => item.status === 'running');
    let execution = executions.find((item) => item.currentRunId === event.run.id);
    if (!execution) {
      for (const candidate of executions) {
        const candidatePipeline = await this.deps.getPipeline(candidate.pipelineId);
        const candidateStage = candidatePipeline?.stages[candidate.currentStageIndex];
        if (candidateStage && event.run.idempotencyKey === `pipeline-${candidate.id}-${candidateStage.id}`) {
          execution = candidate;
          break;
        }
      }
    }
    if (!execution) return;
    const pipeline = await this.deps.getPipeline(execution.pipelineId);
    if (!pipeline) return;
    const stage = pipeline.stages[execution.currentStageIndex];

    if (event.run.status !== 'completed') {
      await this.deps.saveExecution({
        ...execution,
        status: event.run.status === 'cancelled' ? 'cancelled' : 'failed',
        currentRunId: null,
        error: event.run.error,
        updatedAt: this.now()
      });
      return;
    }

    const conversation = await this.deps.getConversation(event.run.conversationId);
    const output = [...(conversation?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant' && message.content.trim())?.content ?? '';
    const existingOutputs = (await this.deps.listArtifacts()).filter(
      (artifact) => artifact.executionId === execution.id && artifact.stageId === stage.id && artifact.kind === 'output'
    );
    const artifact: RunArtifact = {
      id: this.createId(),
      executionId: execution.id,
      stageId: stage.id,
      runId: event.run.id,
      agentId: stage.agentId,
      kind: 'output',
      version: existingOutputs.length + 1,
      content: output,
      createdAt: this.now()
    };
    await this.deps.saveArtifact(artifact);
    const nextExecution: PipelineExecution = {
      ...execution,
      currentRunId: null,
      artifactIds: [...execution.artifactIds, artifact.id],
      updatedAt: this.now()
    };
    if (execution.currentStageIndex >= pipeline.stages.length - 1) {
      await this.deps.saveExecution({ ...nextExecution, status: 'review' });
      return;
    }
    await this.startStage(
      { ...nextExecution, currentStageIndex: execution.currentStageIndex + 1 },
      pipeline
    );
  }

  private async startStage(
    execution: PipelineExecution,
    pipeline: AgentPipeline
  ): Promise<PipelineExecution> {
    const stage = pipeline.stages[execution.currentStageIndex];
    const priorArtifacts = (await this.deps.listArtifacts()).filter(
      (artifact) => execution.artifactIds.includes(artifact.id) && artifact.kind === 'output'
    );
    const briefContent = [
      `# ${stage.name} Brief`,
      '',
      `## Pipeline Goal\n${execution.goal}`,
      `## Instructions\n${stage.instructions}`,
      `## Expected Output\n${stage.expectedOutput}`,
      priorArtifacts.length
        ? `## Upstream Outputs\n${priorArtifacts.map((artifact) => artifact.content).join('\n\n---\n\n')}`
        : ''
    ].filter(Boolean).join('\n\n');
    const brief: RunArtifact = {
      id: this.createId(),
      executionId: execution.id,
      stageId: stage.id,
      runId: null,
      agentId: stage.agentId,
      kind: 'brief',
      version: 1,
      content: briefContent,
      createdAt: this.now()
    };
    await this.deps.saveArtifact(brief);

    const agents = await this.deps.listAgents();
    const agent = agents.find((candidate) => candidate.id === stage.agentId)!;
    const conversationId = this.createId();
    const now = this.now();
    await this.deps.saveConversation({
      id: conversationId,
      title: `Pipeline · ${pipeline.name} · ${stage.name}`,
      connectionId: agent.connectionId,
      model: agent.model,
      messages: [],
      createdAt: now,
      updatedAt: now
    });
    const running: PipelineExecution = {
      ...execution,
      status: 'running',
      currentRunId: null,
      artifactIds: [...execution.artifactIds, brief.id],
      error: null,
      updatedAt: now
    };
    await this.deps.saveExecution(running);
    const run = await this.deps.startRun({
      conversationId,
      agentId: stage.agentId,
      userContent: briefContent,
      idempotencyKey: `pipeline-${execution.id}-${stage.id}`
    });
    const latest = await this.deps.getExecution(execution.id);
    if (
      !latest ||
      latest.status !== 'running' ||
      latest.currentStageIndex !== execution.currentStageIndex
    ) {
      return latest ?? running;
    }
    const correlated = { ...latest, currentRunId: run.id, updatedAt: this.now() };
    await this.deps.saveExecution(correlated);
    return correlated;
  }
}