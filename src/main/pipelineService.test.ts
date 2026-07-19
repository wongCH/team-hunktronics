import { describe, expect, it, vi } from 'vitest';
import type { AgentConfig, AgentPipeline, Conversation, PipelineExecution, RunArtifact, RunView } from '@shared/types';
import { PipelineService, validatePipeline } from './pipelineService';

function agents(): AgentConfig[] {
  const base = { connectionId: 'c1', model: 'm1', soul: '', tools: [], skills: [], autonomy: 'draft' as const, delegatesTo: [], createdAt: 1, updatedAt: 1 };
  return [
    { ...base, id: 'root', name: 'Root', title: 'Root', role: 'orchestrator', reportsTo: null },
    { ...base, id: 'lead', name: 'Lead', title: 'Lead', role: 'team-lead', reportsTo: 'root' },
    { ...base, id: 'one', name: 'One', title: 'Specialist', role: 'specialist', reportsTo: 'lead' },
    { ...base, id: 'two', name: 'Two', title: 'Specialist', role: 'specialist', reportsTo: 'lead' }
  ];
}

function pipeline(): AgentPipeline {
  return {
    id: 'pipeline-1', name: 'Research flow', ownerAgentId: 'lead', enabled: true,
    stages: [
      { id: 'stage-1', name: 'Research', agentId: 'one', instructions: 'Find evidence.', expectedOutput: 'Cited notes.' },
      { id: 'stage-2', name: 'Review', agentId: 'two', instructions: 'Review evidence.', expectedOutput: 'Review report.' }
    ],
    createdAt: 1, updatedAt: 1
  };
}

describe('PipelineService', () => {
  it('enforces bounded stages and direct-report ownership', () => {
    expect(() => validatePipeline(pipeline(), agents())).not.toThrow();
    expect(() => validatePipeline({ ...pipeline(), stages: [] }, agents())).toThrow(/one and eight/i);
    expect(() => validatePipeline({ ...pipeline(), stages: [{ ...pipeline().stages[0], agentId: 'root' }] }, agents())).toThrow(/directly/i);
  });

  it('runs stages sequentially and preserves brief/output artifacts for review', async () => {
    let execution: PipelineExecution | undefined;
    const artifacts: RunArtifact[] = [];
    const conversations = new Map<string, Conversation>();
    const runs: RunView[] = [];
    let id = 0;
    const service = new PipelineService({
      getPipeline: async () => pipeline(),
      listExecutions: async () => execution ? [execution] : [],
      getExecution: async () => execution,
      saveExecution: async (value) => { execution = value; },
      listArtifacts: async () => artifacts,
      saveArtifact: async (value) => { artifacts.push(value); },
      listAgents: async () => agents(),
      saveConversation: async (value) => { conversations.set(value.id, value); },
      getConversation: async (conversationId) => conversations.get(conversationId),
      startRun: async (command) => {
        const run: RunView = { id: `run-${runs.length + 1}`, streamId: 's', idempotencyKey: command.idempotencyKey, conversationId: command.conversationId, agentId: command.agentId, connectionId: 'c1', model: 'm1', status: 'queued', error: null, createdAt: 1, updatedAt: 1 };
        runs.push(run);
        return run;
      },
      createId: () => `id-${++id}`,
      now: () => id
    });

    await service.start('pipeline-1', 'Produce a verified brief.');
    expect(execution).toMatchObject({ status: 'running', currentStageIndex: 0, currentRunId: 'run-1' });
    const firstConversation = conversations.get(runs[0].conversationId)!;
    firstConversation.messages = [{ role: 'assistant', content: 'Evidence output' }];
    await service.handleRunEvent({ type: 'state', run: { ...runs[0], status: 'completed' } });
    expect(execution).toMatchObject({ status: 'running', currentStageIndex: 1, currentRunId: 'run-2' });
    expect(artifacts.some((artifact) => artifact.kind === 'output' && artifact.content === 'Evidence output')).toBe(true);
    const secondConversation = conversations.get(runs[1].conversationId)!;
    secondConversation.messages = [{ role: 'assistant', content: 'Review output' }];
    await service.handleRunEvent({ type: 'state', run: { ...runs[1], status: 'completed' } });
    expect(execution).toMatchObject({ status: 'review', currentRunId: null });
    expect(artifacts.filter((artifact) => artifact.kind === 'brief')).toHaveLength(2);
    expect(artifacts.filter((artifact) => artifact.kind === 'output')).toHaveLength(2);
  });

  it('keeps completed artifacts when a later stage fails', async () => {
    const saveExecution = vi.fn();
    const current: PipelineExecution = { id: 'execution', pipelineId: 'pipeline-1', goal: 'goal', status: 'running', currentStageIndex: 1, currentRunId: 'run-2', artifactIds: ['completed-output'], error: null, createdAt: 1, updatedAt: 1 };
    const service = new PipelineService({
      getPipeline: async () => pipeline(), listExecutions: async () => [current], getExecution: async () => current,
      saveExecution, listArtifacts: async () => [], saveArtifact: async () => undefined, listAgents: async () => agents(),
      saveConversation: async () => undefined, getConversation: async () => undefined, startRun: vi.fn(), now: () => 2
    });
    await service.handleRunEvent({ type: 'state', run: { id: 'run-2', streamId: 's', idempotencyKey: 'k', conversationId: 'c', agentId: 'two', connectionId: 'c1', model: 'm1', status: 'failed', error: 'bad output', createdAt: 1, updatedAt: 2 } });
    expect(saveExecution).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', artifactIds: ['completed-output'], error: 'bad output' }));
  });

  it('correlates a fast terminal event before the stage run id is persisted', async () => {
    const current: PipelineExecution = { id: 'execution', pipelineId: 'pipeline-1', goal: 'goal', status: 'running', currentStageIndex: 0, currentRunId: null, artifactIds: [], error: null, createdAt: 1, updatedAt: 1 };
    const saveExecution = vi.fn();
    const service = new PipelineService({
      getPipeline: async () => pipeline(), listExecutions: async () => [current], getExecution: async () => current,
      saveExecution, listArtifacts: async () => [], saveArtifact: async () => undefined, listAgents: async () => agents(),
      saveConversation: async () => undefined,
      getConversation: async () => ({ id: 'conversation', messages: [{ role: 'assistant', content: 'fast output' }] } as Conversation),
      startRun: async (command) => ({
        id: 'next-run',
        streamId: 'next-stream',
        idempotencyKey: command.idempotencyKey,
        conversationId: command.conversationId,
        agentId: command.agentId,
        connectionId: 'c1',
        model: 'm1',
        status: 'queued',
        error: null,
        createdAt: 2,
        updatedAt: 2
      }),
      createId: () => 'artifact', now: () => 2
    });
    await service.handleRunEvent({ type: 'state', run: { id: 'fast-run', streamId: 's', idempotencyKey: 'pipeline-execution-stage-1', conversationId: 'conversation', agentId: 'one', connectionId: 'c1', model: 'm1', status: 'completed', error: null, createdAt: 1, updatedAt: 2 } });
    expect(saveExecution).toHaveBeenCalled();
  });
});