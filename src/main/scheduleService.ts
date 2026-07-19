import { randomUUID } from 'crypto';
import { CronExpressionParser } from 'cron-parser';
import type { AgentConfig, AgentSchedule, Conversation, RunEvent, RunView } from '@shared/types';

export interface ScheduleServiceDeps {
  listSchedules: () => Promise<AgentSchedule[]>;
  saveSchedule: (schedule: AgentSchedule) => Promise<unknown>;
  getAgent: (id: string) => Promise<AgentConfig | undefined>;
  getConversation: (id: string) => Promise<Conversation | undefined>;
  saveConversation: (conversation: Conversation) => Promise<unknown>;
  startRun: (command: {
    conversationId: string;
    agentId: string;
    userContent: string;
    idempotencyKey: string;
  }) => Promise<RunView>;
  onCompleted?: (schedule: AgentSchedule, event: RunEvent) => Promise<void>;
  maxConcurrent?: number;
  createId?: () => string;
  now?: () => number;
}

export function nextScheduleRun(cron: string, timeZone: string, after: number): number {
  try {
    return CronExpressionParser.parse(cron, {
      currentDate: new Date(after),
      tz: timeZone || 'UTC'
    })
      .next()
      .getTime();
  } catch (error) {
    throw new Error(`Invalid schedule: ${(error as Error).message}`);
  }
}

export class ScheduleService {
  private readonly activeScheduleIds = new Set<string>();
  private readonly createId: () => string;
  private readonly now: () => number;
  private readonly maxConcurrent: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: ScheduleServiceDeps) {
    this.createId = deps.createId ?? randomUUID;
    this.now = deps.now ?? Date.now;
    this.maxConcurrent = Math.max(1, Math.trunc(deps.maxConcurrent ?? 4));
  }

  start(intervalMs = 30_000): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(at = this.now()): Promise<void> {
    const schedules = await this.deps.listSchedules();
    const available = Math.max(0, this.maxConcurrent - this.activeScheduleIds.size);
    const due = schedules
      .filter(
        (schedule) =>
          schedule.enabled && schedule.nextRunAt <= at && !this.activeScheduleIds.has(schedule.id)
      )
      .sort((left, right) => left.nextRunAt - right.nextRunAt)
      .slice(0, available);
    await Promise.allSettled(due.map((schedule) => this.execute(schedule, at)));
  }

  async runNow(scheduleId: string): Promise<RunView> {
    const schedule = (await this.deps.listSchedules()).find((item) => item.id === scheduleId);
    if (!schedule) throw new Error('Schedule not found.');
    if (this.activeScheduleIds.has(schedule.id)) throw new Error('Schedule is already running.');
    return this.execute(schedule, this.now(), true);
  }

  async handleRunEvent(event: RunEvent): Promise<void> {
    if (event.type !== 'state' || !['completed', 'failed', 'cancelled'].includes(event.run.status))
      return;
    const schedules = await this.deps.listSchedules();
    const schedule = schedules.find(
      (item) =>
        item.currentRunId === event.run.id ||
        (item.conversationId === event.run.conversationId && item.lastRunStatus === 'running')
    );
    if (!schedule) return;
    const attempt = schedule.currentAttempt ?? 1;
    if (event.run.status === 'failed' && attempt < schedule.maxAttempts) {
      const retry = {
        ...schedule,
        currentRunId: null,
        lastError: event.run.error,
        updatedAt: this.now()
      };
      await this.deps.saveSchedule(retry);
      this.activeScheduleIds.delete(schedule.id);
      await this.execute(retry, this.now(), false, attempt + 1);
      return;
    }
    const updated: AgentSchedule = {
      ...schedule,
      currentRunId: null,
      lastRunStatus:
        event.run.status === 'completed'
          ? 'succeeded'
          : event.run.status === 'cancelled'
            ? 'cancelled'
            : 'failed',
      lastError: event.run.status === 'completed' ? null : event.run.error,
      currentAttempt: 0,
      updatedAt: this.now()
    };
    await this.deps.saveSchedule(updated);
    this.activeScheduleIds.delete(schedule.id);
    await this.deps.onCompleted?.(updated, event);
  }

  private async execute(
    schedule: AgentSchedule,
    at: number,
    manual = false,
    attempt = 1
  ): Promise<RunView> {
    this.activeScheduleIds.add(schedule.id);
    const agent = await this.deps.getAgent(schedule.agentId);
    if (!agent) {
      this.activeScheduleIds.delete(schedule.id);
      throw new Error('Scheduled agent not found.');
    }
    if (!agent.connectionId || !agent.model) {
      this.activeScheduleIds.delete(schedule.id);
      throw new Error('Configure the scheduled agent model first.');
    }

    let conversationId = schedule.conversationId;
    if (!conversationId || !(await this.deps.getConversation(conversationId))) {
      conversationId = this.createId();
      await this.deps.saveConversation({
        id: conversationId,
        title: `Schedule · ${schedule.name}`,
        connectionId: agent.connectionId,
        model: agent.model,
        messages: [],
        createdAt: at,
        updatedAt: at
      });
    }

    const occurrence = attempt > 1 ? schedule.lastRunAt || at : schedule.nextRunAt || at;
    const pending: AgentSchedule = {
      ...schedule,
      conversationId,
      nextRunAt:
        attempt > 1
          ? schedule.nextRunAt
          : nextScheduleRun(schedule.cron, schedule.timeZone, Math.max(at, occurrence)),
      lastRunAt: attempt > 1 ? schedule.lastRunAt : at,
      lastRunStatus: 'running',
      lastError: null,
      currentRunId: null,
      currentAttempt: attempt,
      updatedAt: at
    };
    await this.deps.saveSchedule(pending);
    try {
      const run = await this.deps.startRun({
        conversationId,
        agentId: agent.id,
        userContent: schedule.prompt,
        idempotencyKey: `schedule-${schedule.id}-${manual ? `manual-${at}` : occurrence}${
          schedule.maxAttempts > 1 ? `-attempt-${attempt}` : ''
        }`
      });
      const latest = (await this.deps.listSchedules()).find((item) => item.id === schedule.id);
      if (latest?.lastRunStatus === 'running') {
        await this.deps.saveSchedule({ ...latest, currentRunId: run.id, updatedAt: this.now() });
      }
      return run;
    } catch (error) {
      const latest =
        (await this.deps.listSchedules()).find((item) => item.id === schedule.id) ?? pending;
      await this.deps.saveSchedule({
        ...latest,
        currentRunId: null,
        lastRunStatus: 'failed',
        lastError: (error as Error).message,
        updatedAt: this.now()
      });
      this.activeScheduleIds.delete(schedule.id);
      if (attempt < schedule.maxAttempts) {
        return this.execute(pending, this.now(), manual, attempt + 1);
      }
      throw error;
    }
  }
}
