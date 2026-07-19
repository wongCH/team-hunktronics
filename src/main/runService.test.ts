import { describe, expect, it, vi } from 'vitest';
import type {
  AgentConfig,
  ChatMessage,
  ConnectionConfig,
  Conversation,
  RunEvent
} from '@shared/types';
import { RunService, type RunExecution } from './runService';

function conversation(): Conversation {
  return {
    id: 'conversation-1',
    title: 'Existing chat',
    connectionId: 'connection-1',
    model: 'model-1',
    messages: [
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' }
    ],
    createdAt: 1,
    updatedAt: 1
  };
}

function connection(): ConnectionConfig {
  return {
    id: 'connection-1',
    providerType: 'openai',
    label: 'Provider',
    hasKey: true,
    createdAt: 1,
    updatedAt: 1
  };
}

function agent(): AgentConfig {
  return {
    id: 'agent-1',
    name: 'Researcher',
    title: 'Research specialist',
    role: 'specialist',
    reportsTo: null,
    connectionId: 'connection-1',
    model: 'model-1',
    soul: 'Stay focused on verified evidence.',
    tools: ['web-search'],
    skills: ['research'],
    autonomy: 'draft',
    delegatesTo: [],
    createdAt: 1,
    updatedAt: 1
  };
}

describe('RunService', () => {
  it('loads authoritative history and agent identity before provider execution', async () => {
    const saved: Conversation[] = [];
    const events: RunEvent[] = [];
    let execution: RunExecution | undefined;
    const service = new RunService({
      getConversation: async () => conversation(),
      saveConversation: async (value) => saved.push(structuredClone(value)),
      getAgent: async () => agent(),
      listAgents: async () => [agent()],
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [{ name: 'Research', instructions: 'Cite primary sources.' }],
      execute: async (value) => {
        execution = value;
        value.onChunk('Verified response');
      },
      onEvent: (event) => events.push(event),
      createId: vi.fn().mockReturnValueOnce('run-1').mockReturnValueOnce('stream-1'),
      now: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(11).mockReturnValueOnce(12)
    });

    const view = await service.start({
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      userContent: 'New question',
      idempotencyKey: 'request-1'
    });

    await vi.waitFor(() => expect(events.at(-1)?.run.status).toBe('completed'));
    expect(view).toEqual({
      id: 'run-1',
      streamId: 'stream-1',
      idempotencyKey: 'request-1',
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      parentRunId: null,
      rootRunId: 'run-1',
      depth: 0,
      connectionId: 'connection-1',
      model: 'model-1',
      status: 'queued',
      error: null,
      createdAt: 10,
      updatedAt: 10
    });
    expect(execution?.messages).toEqual<ChatMessage[]>([
      { role: 'system', content: 'Stay focused on verified evidence.' },
      {
        role: 'system',
        content:
          '## Runtime authorization\nAutonomy mode: draft\nGranted external tool IDs: web-search\nThis run supports text generation and internal delegation only. It cannot execute external tools or MCP calls. Do not claim an external action occurred. Any future external action must be separately authorized for this agent by the ToolPolicyBroker.'
      },
      {
        role: 'system',
        content: '## Assigned Skills\n### Research\nCite primary sources.'
      },
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'New question' }
    ]);
    expect(events.filter((event) => event.type === 'state').map((event) => event.run.status)).toEqual([
      'queued',
      'running',
      'completed'
    ]);
    expect(saved.at(-1)?.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'Verified response'
    });
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('cancels an active provider execution and records a terminal state', async () => {
    const events: RunEvent[] = [];
    const service = new RunService({
      getConversation: async () => conversation(),
      saveConversation: async () => undefined,
      getAgent: async () => undefined,
      listAgents: async () => [],
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      onEvent: (event) => events.push(event),
      createId: vi.fn().mockReturnValueOnce('run-2').mockReturnValueOnce('stream-2')
    });

    const run = await service.start({
      conversationId: 'conversation-1',
      userContent: 'Long request',
      idempotencyKey: 'request-2'
    });
    expect(service.cancel(run.id)).toBe(true);

    await vi.waitFor(() => expect(events.at(-1)?.run.status).toBe('cancelled'));
    expect(events.at(-1)?.run.error).toBe('Generation stopped.');
    expect(service.cancel(run.id)).toBe(false);
  });

  it('lists concurrent active agent runs until each reaches a terminal state', async () => {
    const completions = new Map<
      string,
      { resolve: () => void; reject: (error: Error) => void }
    >();
    const service = new RunService({
      getConversation: async () => conversation(),
      saveConversation: async () => undefined,
      getAgent: async (id) => ({ ...agent(), id }),
      listAgents: async () => [],
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute: ({ run }) =>
        new Promise<void>((resolve, reject) => {
          completions.set(run.agentId!, { resolve, reject });
        }),
      onEvent: () => undefined,
      createId: vi
        .fn()
        .mockReturnValueOnce('run-a')
        .mockReturnValueOnce('stream-a')
        .mockReturnValueOnce('run-b')
        .mockReturnValueOnce('stream-b')
    });

    await service.start({
      conversationId: 'conversation-1',
      agentId: 'agent-a',
      userContent: 'First task',
      idempotencyKey: 'request-a'
    });
    await service.start({
      conversationId: 'conversation-1',
      agentId: 'agent-b',
      userContent: 'Second task',
      idempotencyKey: 'request-b'
    });

    expect(service.listActive().map((run) => run.agentId).sort()).toEqual(['agent-a', 'agent-b']);

    completions.get('agent-a')!.resolve();
    await vi.waitFor(() => expect(service.listActive().map((run) => run.agentId)).toEqual(['agent-b']));

    completions.get('agent-b')!.reject(new Error('Provider failed.'));
    await vi.waitFor(() => expect(service.listActive()).toEqual([]));
  });

  it('reports queued setup work and removes it when setup fails', async () => {
    const events: RunEvent[] = [];
    let rejectMemory!: (error: Error) => void;
    const service = new RunService({
      getConversation: async () => conversation(),
      saveConversation: async () => undefined,
      getAgent: async () => agent(),
      listAgents: async () => [agent()],
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: () =>
        new Promise((_resolve, reject) => {
          rejectMemory = reject;
        }),
      getSkills: async () => [],
      execute: async () => undefined,
      onEvent: (event) => events.push(event),
      createId: vi.fn().mockReturnValueOnce('run-setup').mockReturnValueOnce('stream-setup')
    });

    const start = service.start({
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      userContent: 'Prepare this task',
      idempotencyKey: 'request-setup'
    });
    const failed = expect(start).rejects.toThrow('Memory unavailable.');
    await vi.waitFor(() => expect(service.listActive()[0]?.status).toBe('queued'));

    rejectMemory(new Error('Memory unavailable.'));
    await failed;

    expect(service.listActive()).toEqual([]);
    expect(events.at(-1)?.run).toMatchObject({ status: 'failed', error: 'Memory unavailable.' });
  });

  it('rejects unknown conversations before executing', async () => {
    const execute = vi.fn();
    const service = new RunService({
      getConversation: async () => undefined,
      saveConversation: async () => undefined,
      getAgent: async () => undefined,
      listAgents: async () => [],
      getConnection: async () => undefined,
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute,
      onEvent: () => undefined
    });

    await expect(
      service.start({
        conversationId: 'missing',
        userContent: 'Hello',
        idempotencyKey: 'request-3'
      })
    ).rejects.toThrow('Conversation not found.');
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns the latest lifecycle state for a duplicate idempotency key', async () => {
    const service = new RunService({
      getConversation: async () => conversation(),
      saveConversation: async () => undefined,
      getAgent: async () => undefined,
      listAgents: async () => [],
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute: async ({ onChunk }) => onChunk('Done'),
      onEvent: () => undefined,
      createId: vi.fn().mockReturnValueOnce('run-idempotent').mockReturnValueOnce('stream-idempotent')
    });
    const command = {
      conversationId: 'conversation-1',
      userContent: 'Do this once',
      idempotencyKey: 'same-request'
    };
    await service.start(command);
    await vi.waitFor(async () => {
      expect((await service.start(command)).status).toBe('completed');
    });
  });

  it('runs a direct report and returns its output to the orchestrator for synthesis', async () => {
    const parent = {
      ...agent(),
      id: 'orchestrator',
      name: 'Orchestrator',
      role: 'orchestrator' as const,
      autonomy: 'autonomous' as const,
      delegatesTo: ['researcher']
    };
    const child = {
      ...agent(),
      id: 'researcher',
      reportsTo: parent.id,
      connectionId: 'connection-2',
      model: 'model-2',
      soul: 'Research only from the supplied context.',
      skills: ['research']
    };
    const conversations = new Map([[conversation().id, conversation()]]);
    const executions: RunExecution[] = [];
    const events: RunEvent[] = [];
    const service = new RunService({
      getConversation: async (id) => conversations.get(id),
      saveConversation: async (value) => conversations.set(value.id, structuredClone(value)),
      getAgent: async (id) => [parent, child].find((candidate) => candidate.id === id),
      listAgents: async () => [parent, child],
      getConnection: async (id) => ({ ...connection(), id, label: id }),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async (id) => ({
        teamMemory: 'Shared operating context.',
        agentMemory: id === child.id ? 'Child-specific memory.' : 'Parent-specific memory.'
      }),
      getSkills: async (ids) =>
        ids.map((id) => ({ name: id, instructions: `${id} instructions` })),
      execute: async (execution) => {
        executions.push(execution);
        if (execution.run.agentId === child.id) {
          execution.onChunk('Primary-source finding');
        } else if (executions.filter((item) => item.run.agentId === parent.id).length === 1) {
          execution.onChunk(
            '<delegation-request>{"requests":[{"agentId":"researcher","task":"Find evidence"}]}</delegation-request>'
          );
        } else {
          execution.onChunk('Synthesized answer');
        }
      },
      onEvent: (event) => events.push(event),
      createId: vi
        .fn()
        .mockReturnValueOnce('parent-run')
        .mockReturnValueOnce('parent-stream')
        .mockReturnValueOnce('child-conversation')
        .mockReturnValueOnce('child-run')
        .mockReturnValueOnce('child-stream')
    });

    const run = await service.start({
      conversationId: conversation().id,
      agentId: parent.id,
      userContent: 'Delegate research and summarize it.',
      idempotencyKey: 'delegation-request'
    });

    await vi.waitFor(() =>
      expect(events.find((event) => event.run.id === run.id && event.run.status === 'completed')).toBeTruthy()
    );
    expect(executions.map((execution) => execution.run.agentId)).toEqual([
      parent.id,
      child.id,
      parent.id
    ]);
    expect(executions[1].messages).toContainEqual({
      role: 'system',
      content: child.soul
    });
    expect(
      executions[1].messages.some(
        (message) =>
          message.content.includes('Autonomy mode: draft') &&
          message.content.includes('Granted external tool IDs: web-search') &&
          message.content.includes('cannot execute external tools or MCP calls')
      )
    ).toBe(true);
    expect(executions[1]).toMatchObject({
      connection: { id: child.connectionId },
      model: child.model,
      run: {
        parentRunId: run.id,
        rootRunId: run.id,
        depth: 1
      }
    });
    expect(executions[1].messages).toContainEqual({
      role: 'system',
      content: '## Assigned Skills\n### research\nresearch instructions'
    });
    expect(executions[1].messages.some((message) => message.content.includes('Child-specific memory.'))).toBe(
      true
    );
    expect(executions[1].messages.at(-1)?.content).toContain(
      'Delegate research and summarize it.'
    );
    expect(executions[2].messages.at(-1)?.content).toContain('Primary-source finding');
    expect(conversations.get(conversation().id)?.messages.at(-1)?.content).toBe(
      'Synthesized answer'
    );
  });

  it('rejects delegation to an agent that is not an active direct report', async () => {
    const parent = {
      ...agent(),
      id: 'orchestrator',
      role: 'orchestrator' as const,
      autonomy: 'autonomous' as const
    };
    const unrelated = { ...agent(), id: 'unrelated', reportsTo: 'other-manager' };
    const conversations = new Map([[conversation().id, conversation()]]);
    const events: RunEvent[] = [];
    const execute = vi.fn(async ({ onChunk }: RunExecution) => {
      onChunk(
        '<delegation-request>{"requests":[{"agentId":"unrelated","task":"Do work"}]}</delegation-request>'
      );
    });
    const service = new RunService({
      getConversation: async (id) => conversations.get(id),
      saveConversation: async (value) => conversations.set(value.id, structuredClone(value)),
      getAgent: async (id) => [parent, unrelated].find((candidate) => candidate.id === id),
      listAgents: async () => [parent, unrelated],
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute,
      onEvent: (event) => events.push(event)
    });

    const run = await service.start({
      conversationId: conversation().id,
      agentId: parent.id,
      userContent: 'Delegate this.',
      idempotencyKey: 'invalid-target'
    });

    await vi.waitFor(() =>
      expect(events.find((event) => event.run.id === run.id && event.run.status === 'failed')).toBeTruthy()
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events.at(-1)?.run.error).toBe('Delegation target must be an active direct report.');
    expect(conversations.get(conversation().id)?.messages.at(-1)?.content).toContain(
      'Delegation target must be an active direct report.'
    );
  });

  it('rejects delegation fan-out above the concurrency limit before starting children', async () => {
    const parent = {
      ...agent(),
      id: 'orchestrator',
      role: 'orchestrator' as const,
      autonomy: 'autonomous' as const
    };
    const children = Array.from({ length: 4 }, (_, index) => ({
      ...agent(),
      id: `child-${index}`,
      reportsTo: parent.id
    }));
    const agents = [parent, ...children];
    const conversations = new Map([[conversation().id, conversation()]]);
    const events: RunEvent[] = [];
    const execute = vi.fn(async ({ onChunk }: RunExecution) => {
      onChunk(
        `<delegation-request>${JSON.stringify({
          requests: children.map((child) => ({ agentId: child.id, task: 'Bounded work' }))
        })}</delegation-request>`
      );
    });
    const service = new RunService({
      getConversation: async (id) => conversations.get(id),
      saveConversation: async (value) => conversations.set(value.id, structuredClone(value)),
      getAgent: async (id) => agents.find((candidate) => candidate.id === id),
      listAgents: async () => agents,
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute,
      onEvent: (event) => events.push(event)
    });

    const run = await service.start({
      conversationId: conversation().id,
      agentId: parent.id,
      userContent: 'Attempt excessive fan-out.',
      idempotencyKey: 'fan-out-limit'
    });

    await vi.waitFor(() =>
      expect(events.find((event) => event.run.id === run.id && event.run.status === 'failed')).toBeTruthy()
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events.at(-1)?.run.error).toBe('Delegation requires 1-3 requests.');
  });

  it('stops delegation beyond the configured depth and returns the failure for synthesis', async () => {
    const root = {
      ...agent(),
      id: 'root',
      name: 'Root',
      role: 'orchestrator' as const,
      autonomy: 'autonomous' as const
    };
    const lead = {
      ...agent(),
      id: 'lead',
      name: 'Lead',
      role: 'team-lead' as const,
      reportsTo: root.id,
      autonomy: 'autonomous' as const
    };
    const nested = {
      ...lead,
      id: 'nested',
      name: 'Nested lead',
      reportsTo: lead.id
    };
    const tooDeep = { ...agent(), id: 'too-deep', reportsTo: nested.id };
    const agents = [root, lead, nested, tooDeep];
    const conversations = new Map([[conversation().id, conversation()]]);
    const events: RunEvent[] = [];
    const calls = new Map<string, number>();
    const executions: RunExecution[] = [];
    const service = new RunService({
      getConversation: async (id) => conversations.get(id),
      saveConversation: async (value) => conversations.set(value.id, structuredClone(value)),
      getAgent: async (id) => agents.find((candidate) => candidate.id === id),
      listAgents: async () => agents,
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute: async (execution) => {
        executions.push(execution);
        const id = execution.run.agentId!;
        const count = (calls.get(id) ?? 0) + 1;
        calls.set(id, count);
        if (id === root.id && count === 1) {
          execution.onChunk(
            '<delegation-request>{"requests":[{"agentId":"lead","task":"Lead this"}]}</delegation-request>'
          );
        } else if (id === lead.id && count === 1) {
          execution.onChunk(
            '<delegation-request>{"requests":[{"agentId":"nested","task":"Go deeper"}]}</delegation-request>'
          );
        } else if (id === nested.id) {
          execution.onChunk(
            '<delegation-request>{"requests":[{"agentId":"too-deep","task":"Too deep"}]}</delegation-request>'
          );
        } else {
          execution.onChunk(`${id} synthesis`);
        }
      },
      onEvent: (event) => events.push(event)
    });

    const run = await service.start({
      conversationId: conversation().id,
      agentId: root.id,
      userContent: 'Test bounded delegation.',
      idempotencyKey: 'depth-limit'
    });

    await vi.waitFor(() =>
      expect(events.find((event) => event.run.id === run.id && event.run.status === 'completed')).toBeTruthy()
    );
    expect(executions.some((execution) => execution.run.agentId === tooDeep.id)).toBe(false);
    expect(
      events.find(
        (event) => event.run.agentId === nested.id && event.run.status === 'failed'
      )?.run.error
    ).toBe('Delegation depth cannot exceed 2.');
    expect(
      [...executions]
        .reverse()
        .find((execution) => execution.run.agentId === lead.id)
        ?.messages.at(-1)?.content
    ).toContain('Delegation depth cannot exceed 2.');
  });

  it('detects a delegation loop even if corrupted hierarchy data contains a cycle', async () => {
    const root = {
      ...agent(),
      id: 'root',
      name: 'Root',
      role: 'orchestrator' as const,
      reportsTo: 'lead',
      autonomy: 'autonomous' as const
    };
    const lead = {
      ...agent(),
      id: 'lead',
      name: 'Lead',
      role: 'team-lead' as const,
      reportsTo: root.id,
      autonomy: 'autonomous' as const
    };
    const agents = [root, lead];
    const conversations = new Map([[conversation().id, conversation()]]);
    const events: RunEvent[] = [];
    const calls = new Map<string, number>();
    const executions: RunExecution[] = [];
    const service = new RunService({
      getConversation: async (id) => conversations.get(id),
      saveConversation: async (value) => conversations.set(value.id, structuredClone(value)),
      getAgent: async (id) => agents.find((candidate) => candidate.id === id),
      listAgents: async () => agents,
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute: async (execution) => {
        executions.push(execution);
        const id = execution.run.agentId!;
        const count = (calls.get(id) ?? 0) + 1;
        calls.set(id, count);
        if (id === root.id && count === 1) {
          execution.onChunk(
            '<delegation-request>{"requests":[{"agentId":"lead","task":"Lead this"}]}</delegation-request>'
          );
        } else if (id === lead.id) {
          execution.onChunk(
            '<delegation-request>{"requests":[{"agentId":"root","task":"Loop back"}]}</delegation-request>'
          );
        } else {
          execution.onChunk('Root synthesis');
        }
      },
      onEvent: (event) => events.push(event)
    });

    const run = await service.start({
      conversationId: conversation().id,
      agentId: root.id,
      userContent: 'Test loop protection.',
      idempotencyKey: 'loop-limit'
    });

    await vi.waitFor(() =>
      expect(events.find((event) => event.run.id === run.id && event.run.status === 'completed')).toBeTruthy()
    );
    expect(executions.map((execution) => execution.run.agentId)).toEqual([
      root.id,
      lead.id,
      root.id
    ]);
    expect(
      events.find((event) => event.run.agentId === lead.id && event.run.status === 'failed')?.run.error
    ).toBe('Delegation loop detected.');
  });

  it('passes a child provider failure to the parent synthesis without failing the parent run', async () => {
    const parent = {
      ...agent(),
      id: 'orchestrator',
      role: 'orchestrator' as const,
      autonomy: 'autonomous' as const
    };
    const child = { ...agent(), id: 'child', reportsTo: parent.id };
    const agents = [parent, child];
    const conversations = new Map([[conversation().id, conversation()]]);
    const events: RunEvent[] = [];
    let parentCalls = 0;
    let synthesisMessages: ChatMessage[] = [];
    const service = new RunService({
      getConversation: async (id) => conversations.get(id),
      saveConversation: async (value) => conversations.set(value.id, structuredClone(value)),
      getAgent: async (id) => agents.find((candidate) => candidate.id === id),
      listAgents: async () => agents,
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute: async (execution) => {
        if (execution.run.agentId === child.id) throw new Error('Child provider unavailable.');
        parentCalls += 1;
        if (parentCalls === 1) {
          execution.onChunk(
            '<delegation-request>{"requests":[{"agentId":"child","task":"Investigate"}]}</delegation-request>'
          );
        } else {
          synthesisMessages = execution.messages;
          execution.onChunk('Final answer with disclosed limitation.');
        }
      },
      onEvent: (event) => events.push(event)
    });

    const run = await service.start({
      conversationId: conversation().id,
      agentId: parent.id,
      userContent: 'Delegate despite a provider outage.',
      idempotencyKey: 'child-failure'
    });

    await vi.waitFor(() =>
      expect(events.find((event) => event.run.id === run.id && event.run.status === 'completed')).toBeTruthy()
    );
    expect(
      events.find((event) => event.run.agentId === child.id && event.run.status === 'failed')?.run.error
    ).toBe('Child provider unavailable.');
    expect(synthesisMessages.at(-1)?.content).toContain('Child provider unavailable.');
    expect(synthesisMessages.at(-1)?.content).toContain('"status":"failed"');
    expect(conversations.get(conversation().id)?.messages.at(-1)?.content).toBe(
      'Final answer with disclosed limitation.'
    );
  });

  it('rejects a second delegation envelope during synthesis', async () => {
    const parent = {
      ...agent(),
      id: 'orchestrator',
      role: 'orchestrator' as const,
      autonomy: 'autonomous' as const
    };
    const child = { ...agent(), id: 'child', reportsTo: parent.id };
    const agents = [parent, child];
    const conversations = new Map([[conversation().id, conversation()]]);
    const events: RunEvent[] = [];
    const executions: RunExecution[] = [];
    let parentCalls = 0;
    const envelope =
      '<delegation-request>{"requests":[{"agentId":"child","task":"Try again"}]}</delegation-request>';
    const service = new RunService({
      getConversation: async (id) => conversations.get(id),
      saveConversation: async (value) => conversations.set(value.id, structuredClone(value)),
      getAgent: async (id) => agents.find((candidate) => candidate.id === id),
      listAgents: async () => agents,
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute: async (execution) => {
        executions.push(execution);
        if (execution.run.agentId === child.id) {
          execution.onChunk('Child result');
          return;
        }
        parentCalls += 1;
        execution.onChunk(envelope);
      },
      onEvent: (event) => events.push(event)
    });

    const run = await service.start({
      conversationId: conversation().id,
      agentId: parent.id,
      userContent: 'Do not recurse forever.',
      idempotencyKey: 'one-round-only'
    });

    await vi.waitFor(() =>
      expect(events.find((event) => event.run.id === run.id && event.run.status === 'failed')).toBeTruthy()
    );
    expect(parentCalls).toBe(2);
    expect(executions.map((execution) => execution.run.agentId)).toEqual([
      parent.id,
      child.id,
      parent.id
    ]);
    expect(events.at(-1)?.run.error).toBe('Only one delegation round is allowed per run.');
    expect(JSON.stringify(conversations.get(conversation().id))).not.toContain(envelope);
  });

  it('cancels delegated children with the parent without persisting the control envelope', async () => {
    const parent = {
      ...agent(),
      id: 'orchestrator',
      role: 'orchestrator' as const,
      autonomy: 'autonomous' as const
    };
    const child = { ...agent(), id: 'child', reportsTo: parent.id };
    const agents = [parent, child];
    const conversations = new Map([[conversation().id, conversation()]]);
    const events: RunEvent[] = [];
    const service = new RunService({
      getConversation: async (id) => conversations.get(id),
      saveConversation: async (value) => conversations.set(value.id, structuredClone(value)),
      getAgent: async (id) => agents.find((candidate) => candidate.id === id),
      listAgents: async () => agents,
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute: async (execution) => {
        if (execution.run.agentId === parent.id) {
          execution.onChunk(
            '<delegation-request>{"requests":[{"agentId":"child","task":"Wait"}]}</delegation-request>'
          );
          return;
        }
        await new Promise<void>((_resolve, reject) => {
          execution.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        });
      },
      onEvent: (event) => events.push(event)
    });

    const run = await service.start({
      conversationId: conversation().id,
      agentId: parent.id,
      userContent: 'Delegate cancellable work.',
      idempotencyKey: 'cancel-delegation'
    });
    await vi.waitFor(() =>
      expect(events.some((event) => event.run.agentId === child.id && event.run.status === 'running')).toBe(
        true
      )
    );
    expect(service.cancel(run.id)).toBe(true);

    await vi.waitFor(() =>
      expect(events.find((event) => event.run.id === run.id && event.run.status === 'cancelled')).toBeTruthy()
    );
    expect(
      events.find((event) => event.run.agentId === child.id && event.run.status === 'cancelled')
    ).toBeTruthy();
    expect(conversations.get(conversation().id)?.messages.at(-1)?.content).toContain(
      'Generation stopped.'
    );
    expect(JSON.stringify(conversations.get(conversation().id))).not.toContain(
      '<delegation-request>'
    );
  });

  it('does not leave a child running when cancellation races with child setup', async () => {
    const parent = {
      ...agent(),
      id: 'orchestrator',
      role: 'orchestrator' as const,
      autonomy: 'autonomous' as const
    };
    const child = { ...agent(), id: 'child', reportsTo: parent.id };
    const agents = [parent, child];
    const conversations = new Map([[conversation().id, conversation()]]);
    const events: RunEvent[] = [];
    let releaseChildLookup!: () => void;
    const childLookup = new Promise<void>((resolve) => {
      releaseChildLookup = resolve;
    });
    const service = new RunService({
      getConversation: async (id) => conversations.get(id),
      saveConversation: async (value) => conversations.set(value.id, structuredClone(value)),
      getAgent: async (id) => {
        if (id === child.id) await childLookup;
        return agents.find((candidate) => candidate.id === id);
      },
      listAgents: async () => agents,
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      getSkills: async () => [],
      execute: async (execution) => {
        if (execution.run.agentId === parent.id) {
          execution.onChunk(
            '<delegation-request>{"requests":[{"agentId":"child","task":"Wait"}]}</delegation-request>'
          );
        }
      },
      onEvent: (event) => events.push(event)
    });

    const run = await service.start({
      conversationId: conversation().id,
      agentId: parent.id,
      userContent: 'Cancel during setup.',
      idempotencyKey: 'cancel-setup-race'
    });
    await vi.waitFor(() => expect(service.listActive().some((item) => item.id === run.id)).toBe(true));
    expect(service.cancel(run.id)).toBe(true);
    releaseChildLookup();

    await vi.waitFor(() =>
      expect(events.find((event) => event.run.id === run.id && event.run.status === 'cancelled')).toBeTruthy()
    );
    expect(service.listActive()).toEqual([]);
    const childStates = events
      .filter((event) => event.run.agentId === child.id && event.type === 'state')
      .map((event) => event.run.status);
    expect(
      childStates.length === 0 || ['completed', 'failed', 'cancelled'].includes(childStates.at(-1)!)
    ).toBe(true);
  });
});