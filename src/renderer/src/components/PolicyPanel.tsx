import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { AgentConfig, Approval, ToolAction, ToolSideEffect } from '@shared/types';
import { api } from '@/lib/api';
import { RefreshIcon } from './icons';

export function PolicyPanel() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [actions, setActions] = useState<ToolAction[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [agentId, setAgentId] = useState('');
  const [toolId, setToolId] = useState('');
  const [sideEffect, setSideEffect] = useState<ToolSideEffect>('none');
  const [argumentsText, setArgumentsText] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [nextAgents, nextActions, nextApprovals] = await Promise.all([
        api.agents.list(),
        api.toolPolicy.actions(),
        api.toolPolicy.approvals()
      ]);
      setAgents(nextAgents);
      setActions(nextActions);
      setApprovals(nextApprovals);
      const first = nextAgents[0];
      setAgentId((current) => current || first?.id || '');
      setToolId((current) => current || first?.tools[0] || '');
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const request = async () => {
    setError(null);
    try {
      const args = JSON.parse(argumentsText) as Record<string, unknown>;
      await api.toolPolicy.authorize({ agentId, toolId, sideEffect, arguments: args });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const decide = async (id: string, approved: boolean) => {
    setError(null);
    try {
      await api.toolPolicy.decide(id, approved);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const pending = approvals.filter((approval) => approval.status === 'pending');
  return (
    <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
      {error && (
        <div className="mb-4 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div className="grid grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)] gap-4">
        <section className="panel bg-surface p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <h2 className="text-sm font-semibold">Evaluate tool policy</h2>
              <p className="text-[11px] text-content-muted mt-0.5">
                No tool is executed here. This validates grants, side effects, autonomy, and redaction.
              </p>
            </div>
            <button className="btn-outline !px-2.5" title="Refresh policy data" onClick={() => void load()}>
              <RefreshIcon className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="label">Agent</label>
            <select
              className="field cursor-pointer"
              value={agentId}
              onChange={(event) => {
                const id = event.target.value;
                const agent = agents.find((item) => item.id === id);
                setAgentId(id);
                setToolId(agent?.tools[0] ?? '');
              }}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {agent.autonomy}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tool</label>
              <select className="field cursor-pointer" value={toolId} onChange={(event) => setToolId(event.target.value)}>
                {(selectedAgent?.tools ?? []).map((tool) => <option key={tool} value={tool}>{tool}</option>)}
                <option value="ungranted-tool">Ungrant test</option>
              </select>
            </div>
            <div>
              <label className="label">Side effect</label>
              <select className="field cursor-pointer" value={sideEffect} onChange={(event) => setSideEffect(event.target.value as ToolSideEffect)}>
                <option value="none">Read-only</option>
                <option value="local-write">Local write</option>
                <option value="external">External</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Arguments JSON</label>
            <textarea className="field min-h-28 font-mono text-xs" value={argumentsText} onChange={(event) => setArgumentsText(event.target.value)} spellCheck={false} />
          </div>
          <button className="btn-primary w-full" disabled={!agentId || !toolId} onClick={() => void request()}>
            Evaluate request
          </button>
        </section>

        <section className="space-y-4">
          <div className="panel bg-surface p-4">
            <h2 className="text-sm font-semibold">Pending approvals</h2>
            <div className="mt-3 space-y-2">
              {pending.map((approval) => {
                const action = actions.find((item) => item.id === approval.actionId);
                return (
                  <div key={approval.id} className="border border-border rounded-lg px-3 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{agents.find((agent) => agent.id === approval.agentId)?.name ?? approval.agentId} · {action?.toolId}</div>
                      <div className="text-[10px] text-content-muted mt-1">{approval.reason}</div>
                    </div>
                    <button className="btn-danger !py-1" onClick={() => void decide(approval.id, false)}>Reject</button>
                    <button className="btn-primary !py-1" onClick={() => void decide(approval.id, true)}>Approve</button>
                  </div>
                );
              })}
              {pending.length === 0 && <p className="text-xs text-content-faint py-3">No pending approvals.</p>}
            </div>
          </div>

          <div className="panel bg-surface overflow-hidden">
            <div className="px-4 py-3 border-b border-border"><h2 className="text-sm font-semibold">Policy ledger</h2></div>
            <div className="max-h-[360px] overflow-auto divide-y divide-border">
              {actions.map((action) => (
                <div key={action.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={clsx('chip !py-0.5 capitalize', action.status === 'approved' && 'border-emerald-500/40 text-emerald-300', action.status === 'denied' && 'border-red-500/40 text-red-300', action.status === 'awaiting-approval' && 'border-amber-500/40 text-amber-300')}>{action.status}</span>
                    <span className="text-xs">{action.toolId}</span>
                    <span className="ml-auto text-[10px] text-content-faint">{action.sideEffect}</span>
                  </div>
                  <pre className="mt-2 text-[10px] whitespace-pre-wrap break-words text-content-muted">{JSON.stringify(action.sanitizedArguments, null, 2)}</pre>
                  {action.error && <div className="text-[10px] text-red-300 mt-1">{action.error}</div>}
                </div>
              ))}
              {actions.length === 0 && <p className="text-xs text-content-faint p-4">No policy decisions recorded.</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}