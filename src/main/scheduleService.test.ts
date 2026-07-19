import { describe, expect, it, vi } from 'vitest';
import type { AgentConfig, AgentSchedule, Conversation, RunEvent, RunView } from '@shared/types';
import { nextScheduleRun, ScheduleService } from './scheduleService';

function agent(): AgentConfig {
  return {
    id: 'agent-1',
    name: 'Agent',
    title: 'Specialist',
    role: 'specialist',
    reportsTo: 'root',
    connectionId: 'connection-1',
    model: 'model-1',
    soul: '',
    tools: [],
    skills: [],
    autonomy: 'draft',
    delegatesTo: [],
    createdAt: 1,
    updatedAt: 1
  };
}

function schedule(nextRunAt: number): AgentSchedule {
  return {
    id: 'schedule-1',
    name: 'Daily research',
    agentId: 'agent-1',
    prompt: 'Research one topic.',
    cron: '0 9 * * *',
    timeZone: 'UTC',
    enabled: true,
    maxAttempts: 1,
    nextRunAt,
    lastRunAt: null,
    lastRunStatus: 'idle',
    lastError: null,
    conversationId: null,
    currentRunId: null,
    createdAt: 1,
    updatedAt: 1
  };
}

describe('ScheduleService', () => {
  it('calculates the next occurrence in the configured timezone', () => {
    const next = nextScheduleRun('0 9 * * *', 'UTC', Date.parse('2026-07-19T08:00:00Z'));
    expect(new Date(next).toISOString()).toBe('2026-07-19T09:00:00.000Z');
  });

  it('runs one due occurrence and advances nextRunAt before execution', async () => {
    const at = Date.parse('2026-07-19T09:00:00Z');
    let stored = schedule(at);
    let conversation: Conversation | undefined;
    const startRun = vi.fn(async (): Promise<RunView> => ({
      id: 'run-1',
      streamId: 'stream-1',
      idempotencyKey: 'key',
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      connectionId: 'connection-1',
      model: 'model-1',
      status: 'queued',
      error: null,
      createdAt: at,
      updatedAt: at
    }));
    const service = new ScheduleService({
      listSchedules: async () => [stored],
      saveSchedule: async (value) => {
        stored = value;
      },
      getAgent: async () => agent(),
      getConversation: async () => conversation,
      saveConversation: async (value) => {
        conversation = value;
      },
      startRun,
      createId: () => 'conversation-1',
      now: () => at
    });

    await service.tick(at);
    expect(startRun).toHaveBeenCalledTimes(1);
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `schedule-schedule-1-${at}` })
    );
    expect(stored.nextRunAt).toBeGreaterThan(at);
    expect(stored.currentRunId).toBe('run-1');
    await service.tick(at);
    expect(startRun).toHaveBeenCalledTimes(1);
  });

  it('records terminal events and isolates failed starts', async () => {
    const at = Date.parse('2026-07-19T09:00:00Z');
    let stored: AgentSchedule = {
      ...schedule(at),
      conversationId: 'conversation-1',
      currentRunId: 'run-1',
      lastRunStatus: 'running'
    };
    const onCompleted = vi.fn();
    const service = new ScheduleService({
      listSchedules: async () => [stored],
      saveSchedule: async (value) => {
        stored = value;
      },
      getAgent: async () => agent(),
      getConversation: async () => ({ id: 'conversation-1' }) as Conversation,
      saveConversation: async () => undefined,
      startRun: async () => {
        throw new Error('provider unavailable');
      },
      onCompleted,
      now: () => at
    });
    const event: RunEvent = {
      type: 'state',
      run: {
        id: 'run-1',
        streamId: 'stream-1',
        idempotencyKey: 'key',
        conversationId: 'conversation-1',
        agentId: 'agent-1',
        connectionId: 'connection-1',
        model: 'model-1',
        status: 'failed',
        error: 'provider unavailable',
        createdAt: at,
        updatedAt: at
      }
    };
    await service.handleRunEvent(event);
    expect(stored).toMatchObject({
      currentRunId: null,
      lastRunStatus: 'failed',
      lastError: 'provider unavailable'
    });
    expect(onCompleted).toHaveBeenCalledWith(stored, event);
  });

  it('correlates a terminal event that arrives before the run id is persisted', async () => {
    const at = Date.parse('2026-07-19T09:00:00Z');
    let stored: AgentSchedule = {
      ...schedule(at),
      conversationId: 'conversation-1',
      currentRunId: null,
      lastRunStatus: 'running'
    };
    const service = new ScheduleService({
      listSchedules: async () => [stored],
      saveSchedule: async (value) => {
        stored = value;
      },
      getAgent: async () => agent(),
      getConversation: async () => ({ id: 'conversation-1' }) as Conversation,
      saveConversation: async () => undefined,
      startRun: vi.fn(),
      now: () => at
    });
    await service.handleRunEvent({
      type: 'state',
      run: {
        id: 'fast-run',
        streamId: 'stream',
        idempotencyKey: 'key',
        conversationId: 'conversation-1',
        agentId: 'agent-1',
        connectionId: 'connection-1',
        model: 'model-1',
        status: 'completed',
        error: null,
        createdAt: at,
        updatedAt: at
      }
    });
    expect(stored).toMatchObject({ lastRunStatus: 'succeeded', currentRunId: null });
  });

  it('bounds due schedule bursts and leaves overflow due for the next tick', async () => {
    const at = Date.parse('2026-07-19T09:00:00Z');
    const schedules = Array.from({ length: 10 }, (_, index) => ({
      ...schedule(at),
      id: `schedule-${index}`
    }));
    const startRun = vi.fn(async (command): Promise<RunView> => ({
      id: command.idempotencyKey,
      streamId: command.idempotencyKey,
      idempotencyKey: command.idempotencyKey,
      conversationId: command.conversationId,
      agentId: command.agentId,
      connectionId: 'connection-1',
      model: 'model-1',
      status: 'queued',
      error: null,
      createdAt: at,
      updatedAt: at
    }));
    const service = new ScheduleService({
      listSchedules: async () => schedules,
      saveSchedule: async (value) => {
        const index = schedules.findIndex((item) => item.id === value.id);
        schedules[index] = value;
      },
      getAgent: async () => agent(),
      getConversation: async () => undefined,
      saveConversation: async () => undefined,
      startRun,
      maxConcurrent: 4,
      now: () => at
    });

    await service.tick(at);
    expect(startRun).toHaveBeenCalledTimes(4);
    expect(schedules.filter((item) => item.nextRunAt === at)).toHaveLength(6);
  });

  it('retries failed starts up to maxAttempts with distinct idempotency keys', async () => {
    const at = Date.parse('2026-07-19T09:00:00Z');
    let stored = { ...schedule(at), maxAttempts: 3 };
    const startRun = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValue({
        id: 'run-2',
        streamId: 'stream-2',
        idempotencyKey: 'key-2',
        conversationId: 'conversation-1',
        agentId: 'agent-1',
        connectionId: 'connection-1',
        model: 'model-1',
        status: 'queued',
        error: null,
        createdAt: at,
        updatedAt: at
      } satisfies RunView);
    const service = new ScheduleService({
      listSchedules: async () => [stored],
      saveSchedule: async (value) => {
        stored = value;
      },
      getAgent: async () => agent(),
      getConversation: async () => undefined,
      saveConversation: async () => undefined,
      startRun,
      createId: () => 'conversation-1',
      now: () => at
    });

    await service.tick(at);
    expect(startRun).toHaveBeenCalledTimes(2);
    expect(startRun.mock.calls.map(([command]) => command.idempotencyKey)).toEqual([
      `schedule-schedule-1-${at}-attempt-1`,
      `schedule-schedule-1-${at}-attempt-2`
    ]);
    expect(stored).toMatchObject({ currentRunId: 'run-2', currentAttempt: 2 });
  });
});
