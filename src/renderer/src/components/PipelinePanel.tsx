import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type {
  AgentConfig,
  AgentPipeline,
  PipelineExecution,
  PipelineStage,
  RunArtifact
} from '@shared/types';
import { api } from '@/lib/api';
import { Modal } from './Modal';
import { PlusIcon, RefreshIcon, TrashIcon, XIcon } from './icons';

function emptyPipeline(agents: AgentConfig[]): AgentPipeline {
  const now = Date.now();
  const owner = agents.find((agent) => agent.role !== 'specialist');
  return {
    id: crypto.randomUUID(),
    name: '',
    ownerAgentId: owner?.id ?? '',
    stages: [],
    enabled: true,
    createdAt: now,
    updatedAt: now
  };
}

export function PipelinePanel({ agents }: { agents: AgentConfig[] }) {
  const [pipelines, setPipelines] = useState<AgentPipeline[]>([]);
  const [executions, setExecutions] = useState<PipelineExecution[]>([]);
  const [artifacts, setArtifacts] = useState<RunArtifact[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentPipeline | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [nextPipelines, nextExecutions, nextArtifacts] = await Promise.all([
        api.pipelines.list(),
        api.pipelines.executions(),
        api.pipelines.artifacts()
      ]);
      setPipelines(nextPipelines);
      setExecutions(nextExecutions.sort((a, b) => b.updatedAt - a.updatedAt));
      setArtifacts(nextArtifacts);
      setSelectedPipelineId((current) => current ?? nextPipelines[0]?.id ?? null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  useEffect(() => {
    void load();
    return api.runs.onEvent((event) => {
      if (
        event.type === 'state' &&
        ['completed', 'failed', 'cancelled'].includes(event.run.status)
      ) {
        window.setTimeout(() => void load(), 100);
      }
    });
  }, []);

  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? null;
  const selectedExecution =
    executions.find((execution) => execution.id === selectedExecutionId) ??
    executions.find((execution) => execution.pipelineId === selectedPipelineId) ??
    null;
  const executionArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.executionId === selectedExecution?.id),
    [artifacts, selectedExecution?.id]
  );

  const save = async (pipeline: AgentPipeline) => {
    setError(null);
    try {
      const next = await api.pipelines.save(pipeline);
      setPipelines(next);
      setSelectedPipelineId(pipeline.id);
      setEditing(null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const remove = async (id: string) => {
    setPipelines(await api.pipelines.delete(id));
    setSelectedPipelineId(null);
    setEditing(null);
  };

  const start = async (pipeline: AgentPipeline) => {
    const goal = window.prompt('Pipeline goal');
    if (!goal?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const execution = await api.pipelines.start(pipeline.id, goal);
      await load();
      setSelectedExecutionId(execution.id);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const owners = agents.filter((agent) => agent.role !== 'specialist');
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold">Agent pipelines</h2>
          <p className="text-[11px] text-content-muted mt-0.5">
            Leads delegate bounded sequential stages to direct reports; every brief and output is preserved.
          </p>
        </div>
        <button className="btn-outline !px-2.5" title="Refresh pipelines" onClick={() => void load()}>
          <RefreshIcon className="w-4 h-4" />
        </button>
        <button
          className="btn-primary"
          onClick={() => setEditing(emptyPipeline(agents))}
          disabled={owners.length === 0}
        >
          <PlusIcon className="w-4 h-4" /> New pipeline
        </button>
      </div>
      {error && (
        <div className="mx-6 mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-r border-border overflow-y-auto p-3 space-y-4">
          <div>
            <div className="label px-1">Definitions</div>
            <div className="space-y-1">
              {pipelines.map((pipeline) => (
                <button
                  key={pipeline.id}
                  className={clsx(
                    'w-full text-left rounded-lg border px-3 py-2',
                    pipeline.id === selectedPipelineId
                      ? 'border-neon/40 bg-neon/10'
                      : 'border-transparent hover:border-border hover:bg-white/[0.03]'
                  )}
                  onClick={() => {
                    setSelectedPipelineId(pipeline.id);
                    setSelectedExecutionId(null);
                  }}
                >
                  <div className="text-sm font-medium">{pipeline.name}</div>
                  <div className="text-[10px] text-content-faint mt-0.5">
                    {pipeline.stages.length} stages · {agents.find((agent) => agent.id === pipeline.ownerAgentId)?.name ?? 'Missing owner'}
                  </div>
                </button>
              ))}
              {pipelines.length === 0 && <p className="text-xs text-content-faint px-2 py-4">No pipelines defined.</p>}
            </div>
          </div>
          <div>
            <div className="label px-1">Recent runs</div>
            <div className="space-y-1">
              {executions.slice(0, 20).map((execution) => (
                <button
                  key={execution.id}
                  className={clsx(
                    'w-full text-left rounded-lg border px-3 py-2',
                    execution.id === selectedExecution?.id
                      ? 'border-neon/40 bg-neon/10'
                      : 'border-transparent hover:border-border hover:bg-white/[0.03]'
                  )}
                  onClick={() => {
                    setSelectedPipelineId(execution.pipelineId);
                    setSelectedExecutionId(execution.id);
                  }}
                >
                  <div className="text-xs truncate">{execution.goal}</div>
                  <div className="text-[10px] text-content-faint mt-0.5 capitalize">
                    {execution.status} · stage {execution.currentStageIndex + 1}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0 overflow-y-auto p-5">
          {selectedPipeline ? (
            <div className="max-w-4xl mx-auto space-y-5">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold">{selectedPipeline.name}</h2>
                  <p className="text-xs text-content-muted mt-1">
                    Owner: {agents.find((agent) => agent.id === selectedPipeline.ownerAgentId)?.name ?? 'Missing owner'}
                  </p>
                </div>
                <button className="btn-outline" onClick={() => setEditing(selectedPipeline)}>Edit</button>
                <button className="btn-primary" disabled={busy || !selectedPipeline.enabled} onClick={() => void start(selectedPipeline)}>
                  {busy ? 'Starting…' : 'Run pipeline'}
                </button>
              </div>

              <div className="grid gap-2">
                {selectedPipeline.stages.map((stage, index) => (
                  <div key={stage.id} className="panel bg-surface px-4 py-3 flex gap-3">
                    <span className="w-7 h-7 rounded-md bg-neon/10 text-neon grid place-items-center text-xs shrink-0">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{stage.name}</div>
                      <div className="text-[11px] text-content-muted mt-1">{stage.instructions}</div>
                      <div className="text-[10px] text-content-faint mt-2">
                        {agents.find((agent) => agent.id === stage.agentId)?.name ?? 'Missing agent'} · Output: {stage.expectedOutput}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedExecution && (
                <div className="border-t border-border pt-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold flex-1">Execution review</h3>
                    <span className={clsx('chip capitalize', selectedExecution.status === 'review' && 'border-emerald-500/40 text-emerald-300', selectedExecution.status === 'failed' && 'border-red-500/40 text-red-300', selectedExecution.status === 'running' && 'border-neon/40 text-neon')}>
                      {selectedExecution.status}
                    </span>
                  </div>
                  <p className="text-sm text-content-muted">{selectedExecution.goal}</p>
                  {selectedExecution.error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{selectedExecution.error}</div>}
                  <div className="space-y-2">
                    {executionArtifacts.map((artifact) => {
                      const stage = selectedPipeline.stages.find((item) => item.id === artifact.stageId);
                      return (
                        <details key={artifact.id} className="panel bg-surface px-4 py-3" open={artifact.kind === 'output'}>
                          <summary className="cursor-pointer text-xs font-medium">
                            {stage?.name ?? artifact.stageId} · {artifact.kind} v{artifact.version}
                          </summary>
                          <pre className="mt-3 text-[11px] whitespace-pre-wrap break-words text-content-muted bg-black/20 border border-border rounded-md p-3 max-h-80 overflow-auto">{artifact.content || '(empty output)'}</pre>
                        </details>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full grid place-items-center text-center text-sm text-content-faint">
              Create a pipeline owned by an orchestrator or team lead.
            </div>
          )}
        </section>
      </div>

      {editing && (
        <PipelineModal
          pipeline={editing}
          agents={agents}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={pipelines.some((pipeline) => pipeline.id === editing.id) ? remove : undefined}
        />
      )}
    </div>
  );
}

function PipelineModal({
  pipeline,
  agents,
  onClose,
  onSave,
  onDelete
}: {
  pipeline: AgentPipeline;
  agents: AgentConfig[];
  onClose: () => void;
  onSave: (pipeline: AgentPipeline) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(pipeline);
  const owner = agents.find((agent) => agent.id === draft.ownerAgentId);
  const reports = agents.filter((agent) => agent.reportsTo === owner?.id && !agent.archived);
  const addStage = () => {
    const stage: PipelineStage = {
      id: crypto.randomUUID(),
      name: '',
      agentId: reports[0]?.id ?? '',
      instructions: '',
      expectedOutput: ''
    };
    setDraft({ ...draft, stages: [...draft.stages, stage] });
  };
  const updateStage = (id: string, patch: Partial<PipelineStage>) =>
    setDraft({ ...draft, stages: draft.stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage) });
  return (
    <Modal
      title={onDelete ? 'Edit pipeline' : 'New pipeline'}
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center gap-2 w-full">
          {onDelete && <button className="btn-danger !px-2.5" title="Delete pipeline" onClick={() => void onDelete(pipeline.id)}><TrashIcon className="w-4 h-4" /></button>}
          <div className="flex-1" />
          <button className="btn-primary" disabled={!draft.name.trim() || !draft.ownerAgentId || draft.stages.length === 0} onClick={() => void onSave(draft)}>Save pipeline</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Name</label><input className="field" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
          <div><label className="label">Owner</label><select className="field cursor-pointer" value={draft.ownerAgentId} onChange={(event) => setDraft({ ...draft, ownerAgentId: event.target.value, stages: [] })}>{agents.filter((agent) => agent.role !== 'specialist').map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.role}</option>)}</select></div>
        </div>
        <div className="flex items-center"><div className="flex-1"><h3 className="text-sm font-semibold">Stages</h3><p className="text-[11px] text-content-faint">One focused job per direct report, maximum eight.</p></div><button className="btn-outline" disabled={reports.length === 0 || draft.stages.length >= 8} onClick={addStage}><PlusIcon className="w-4 h-4" /> Add stage</button></div>
        <div className="space-y-3">
          {draft.stages.map((stage, index) => (
            <div key={stage.id} className="panel bg-overlay p-3 space-y-3">
              <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-md bg-neon/10 text-neon grid place-items-center text-xs">{index + 1}</span><input className="field flex-1" value={stage.name} onChange={(event) => updateStage(stage.id, { name: event.target.value })} placeholder="Stage name" /><button className="btn-ghost !p-1.5" onClick={() => setDraft({ ...draft, stages: draft.stages.filter((item) => item.id !== stage.id) })}><XIcon className="w-4 h-4" /></button></div>
              <select className="field cursor-pointer" value={stage.agentId} onChange={(event) => updateStage(stage.id, { agentId: event.target.value })}>{reports.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
              <textarea className="field min-h-20" value={stage.instructions} onChange={(event) => updateStage(stage.id, { instructions: event.target.value })} placeholder="Focused instructions" />
              <input className="field" value={stage.expectedOutput} onChange={(event) => updateStage(stage.id, { expectedOutput: event.target.value })} placeholder="Expected output contract" />
            </div>
          ))}
          {reports.length === 0 && <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">The selected owner needs direct reports before it can own a pipeline.</p>}
        </div>
      </div>
    </Modal>
  );
}