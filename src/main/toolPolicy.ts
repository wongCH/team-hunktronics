import { createHash, randomUUID } from 'crypto';
import type {
  AgentConfig,
  Approval,
  ToolAction,
  ToolActionRequest
} from '@shared/types';

const SENSITIVE_KEY = /token|secret|password|api[-_]?key|authorization|cookie/i;

export interface ToolPolicyDeps {
  getAgent: (id: string) => Promise<AgentConfig | undefined>;
  saveAction: (action: ToolAction) => Promise<unknown>;
  getApproval: (id: string) => Promise<Approval | undefined>;
  saveApproval: (approval: Approval) => Promise<unknown>;
  createId?: () => string;
  now?: () => number;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(item)
    ])
  );
}

export class ToolPolicyBroker {
  private readonly createId: () => string;
  private readonly now: () => number;

  constructor(private readonly deps: ToolPolicyDeps) {
    this.createId = deps.createId ?? randomUUID;
    this.now = deps.now ?? Date.now;
  }

  async authorize(request: ToolActionRequest): Promise<{ action: ToolAction; approval?: Approval }> {
    const agent = await this.deps.getAgent(request.agentId);
    if (!agent) throw new Error('Agent not found.');
    const now = this.now();
    const sanitizedArguments = sanitize(request.arguments) as Record<string, unknown>;
    const action: ToolAction = {
      id: this.createId(),
      runId: request.runId ?? null,
      agentId: agent.id,
      toolId: request.toolId,
      argumentsDigest: createHash('sha256').update(JSON.stringify(request.arguments)).digest('hex'),
      sanitizedArguments,
      sideEffect: request.sideEffect,
      status: 'denied',
      approvalId: null,
      error: null,
      resultSummary: null,
      createdAt: now,
      updatedAt: now
    };

    if (!agent.tools.includes(request.toolId)) {
      action.error = 'Tool is not granted to this agent.';
      await this.deps.saveAction(action);
      return { action };
    }
    if (request.sideEffect === 'none' || agent.autonomy === 'autonomous') {
      action.status = 'approved';
      await this.deps.saveAction(action);
      return { action };
    }

    const approval: Approval = {
      id: this.createId(),
      actionId: action.id,
      agentId: agent.id,
      status: 'pending',
      reason:
        agent.autonomy === 'draft'
          ? 'Draft-mode agents require explicit approval for side effects.'
          : 'Assist-mode agents require approval before side effects.',
      expiresAt: now + 15 * 60_000,
      decidedAt: null,
      createdAt: now
    };
    action.status = 'awaiting-approval';
    action.approvalId = approval.id;
    await this.deps.saveApproval(approval);
    await this.deps.saveAction(action);
    return { action, approval };
  }

  async decide(approvalId: string, approved: boolean): Promise<Approval> {
    const approval = await this.deps.getApproval(approvalId);
    if (!approval) throw new Error('Approval not found.');
    if (approval.status !== 'pending') throw new Error('Approval has already been decided.');
    const now = this.now();
    const updated: Approval = {
      ...approval,
      status: now > approval.expiresAt ? 'expired' : approved ? 'approved' : 'rejected',
      decidedAt: now
    };
    await this.deps.saveApproval(updated);
    return updated;
  }
}