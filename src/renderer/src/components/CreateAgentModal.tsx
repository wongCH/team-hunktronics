import { useState } from 'react';
import clsx from 'clsx';
import type { AgentRole } from '@shared/types';
import { useAppStore } from '@/store/useAppStore';
import { useAgentStore } from '@/store/useAgentStore';
import { api } from '@/lib/api';
import { Modal } from './Modal';

/** One-shot LLM call that accumulates the streamed reply into a string. */
function generateText(connectionId: string, model: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let acc = '';
    let sid: string | null = null;
    const unsubs = [
      api.chat.onChunk(({ streamId, delta }) => {
        if (streamId === sid) acc += delta;
      }),
      api.chat.onDone(({ streamId }) => {
        if (streamId === sid) {
          cleanup();
          resolve(acc.trim());
        }
      }),
      api.chat.onError(({ streamId, message }) => {
        if (streamId === sid) {
          cleanup();
          reject(new Error(message));
        }
      })
    ];
    const cleanup = () => unsubs.forEach((u) => u());
    api.chat
      .send({ connectionId, model, messages: [{ role: 'user', content: prompt }] })
      .then((r) => {
        sid = r.streamId;
      })
      .catch((e) => {
        cleanup();
        reject(e as Error);
      });
  });
}

function buildSoul(name: string, role: string, description: string, type: AgentRole): string {
  const heading = role ? `# ${name} — ${role}` : `# ${name}`;
  const body =
    description ||
    (type === 'orchestrator'
      ? 'Delegates tasks to teammates and synthesizes their results.'
      : type === 'team-lead'
        ? 'Owns a domain pipeline and coordinates its specialists end to end.'
        : 'Completes one focused job and reports a structured result.');
  return `${heading}\n\n${body}\n\n## Guardrails\n- Respect your autonomy level for any action that has side effects.\n- Ask for missing information instead of guessing.\n`;
}

export function CreateAgentModal({
  role: initialRole,
  onClose,
  onCreated
}: {
  role: AgentRole;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const settings = useAppStore((s) => s.settings);
  const createAgent = useAgentStore((s) => s.createAgent);

  const [type, setType] = useState<AgentRole>(initialRole);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [useAI, setUseAI] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connId = settings?.activeConnectionId ?? null;
  const model = settings?.activeModel ?? null;
  const aiAvailable = Boolean(connId && model);

  const submit = async () => {
    if (!name.trim()) {
      setError('Please enter a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let soul: string | undefined;
      if (useAI && aiAvailable) {
        const prompt = `Write a concise soul.md persona file in Markdown for an AI agent.\n\nName: ${name.trim()}\nRole: ${role.trim() || '(unspecified)'}\nWhat it does and its guardrails: ${description.trim() || '(unspecified)'}\n\nInclude short sections for: Role, Responsibilities (what it does), Guardrails (what it must not do), and Tone. Output ONLY the Markdown, with no preamble or code fences.`;
        soul = await generateText(connId!, model!, prompt);
      } else if (description.trim() || role.trim()) {
        soul = buildSoul(name.trim(), role.trim(), description.trim(), type);
      }
      const agent = await createAgent({
        role: type,
        name: name.trim(),
        title: role.trim() || undefined,
        soul
      });
      onCreated(agent.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New agent"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => void submit()}
            disabled={busy || !name.trim()}
          >
            {busy ? (useAI ? 'Generating soul.md…' : 'Creating…') : 'Create agent'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['orchestrator', 'team-lead', 'specialist'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={clsx(
                'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                type === t
                  ? 'border-neon/50 bg-neon/10 text-neon'
                  : 'border-border text-content-muted hover:border-borderStrong'
              )}
            >
              {t === 'orchestrator' ? '◆ Orchestrator' : t === 'team-lead' ? '◇ Team lead' : '◈ Specialist'}
            </button>
          ))}
        </div>

        <div>
          <label className="label">Name</label>
          <input
            className="field"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Riley"
          />
        </div>

        <div>
          <label className="label">Role</label>
          <input
            className="field"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Inbox Agent"
          />
        </div>

        <div>
          <label className="label">Description — what it does and its guardrails</label>
          <textarea
            className="field min-h-[110px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the agent's responsibilities and any limits (what it must not do)…"
          />
        </div>

        <label
          className={clsx(
            'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
            useAI ? 'border-neon/40 bg-neon/5' : 'border-border',
            !aiAvailable && 'opacity-60 cursor-not-allowed'
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5 accent-neon"
            checked={useAI}
            disabled={!aiAvailable}
            onChange={(e) => setUseAI(e.target.checked)}
          />
          <div className="text-sm">
            Generate <span className="font-mono">soul.md</span> with AI
            <div className="text-[11px] text-content-faint mt-0.5">
              {aiAvailable
                ? 'Uses your active model to write the persona from the fields above.'
                : 'Select an active connection & model (in Chat) to enable this.'}
            </div>
          </div>
        </label>

        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
