import { useEffect, useState } from 'react';
import type { ConnectionConfig, TestResult } from '@shared/types';
import { PROVIDER_META } from '@shared/types';
import type { DeviceCodePayload } from '@shared/ipc';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { CheckIcon, EyeIcon, EyeOffIcon, TrashIcon } from './icons';

export function ConnectionForm({
  initial,
  onDone
}: {
  initial: ConnectionConfig;
  onDone: () => void;
}) {
  const meta = PROVIDER_META[initial.providerType];
  const { saveConnection, deleteConnection, setSecret, clearSecret, testConnection, connections } =
    useAppStore();

  const [label, setLabel] = useState(initial.label);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl ?? '');
  const [defaultModel, setDefaultModel] = useState(initial.defaultModel ?? '');
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [deviceCode, setDeviceCode] = useState<DeviceCodePayload | null>(null);

  const live = connections.find((c) => c.id === initial.id);
  const hasKey = live?.hasKey ?? false;
  const existing = Boolean(live);

  useEffect(() => {
    const unsub = api.github.onDeviceCode((code) => {
      setDeviceCode(code);
      void api.shell.openExternal(code.verificationUri);
    });
    return unsub;
  }, []);

  const draft = (): ConnectionConfig => ({
    ...initial,
    label: label.trim() || meta.name,
    baseUrl: baseUrl.trim() || undefined,
    defaultModel: defaultModel.trim() || undefined,
    updatedAt: Date.now()
  });

  const persist = () => saveConnection(draft());

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const onSaveKey = () =>
    run(async () => {
      if (!keyInput.trim()) return;
      await persist();
      await setSecret(initial.id, keyInput);
      setKeyInput('');
    });

  const onRemoveKey = () => run(() => clearSecret(initial.id));

  const onDeviceLogin = () =>
    run(async () => {
      setTest(null);
      setDeviceCode(null);
      await persist();
      const res = await api.github.startDeviceFlow(initial.id);
      setDeviceCode(null);
      setTest({ ok: res.ok, message: res.message });
    });

  const onTest = () =>
    run(async () => {
      setTest(null);
      await persist();
      setTest(await testConnection(initial.id));
    });

  const onSave = () => run(async () => {
    await persist();
    onDone();
  });

  const onDelete = () => run(async () => {
    await deleteConnection(initial.id);
    onDone();
  });

  const showCredentials = meta.needsKey || meta.supportsDeviceFlow;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{meta.name}</h3>
          <p className="text-xs text-content-muted mt-1 max-w-md">{meta.description}</p>
        </div>
        {meta.experimental && (
          <span className="chip border-amber-500/40 text-amber-300">Experimental</span>
        )}
      </div>

      <div>
        <label className="label">Connection name</label>
        <input
          className="field"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={meta.name}
        />
      </div>

      {meta.needsBaseUrl && (
        <div>
          <label className="label">Base URL</label>
          <input
            className="field"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={meta.defaultBaseUrl}
          />
        </div>
      )}

      <div>
        <label className="label">Default model (optional)</label>
        <input
          className="field"
          list="acp-suggested-models"
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          placeholder={meta.suggestedModels?.[0] ?? 'e.g. gpt-4o'}
        />
        <datalist id="acp-suggested-models">
          {(meta.suggestedModels ?? []).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>

      {showCredentials && (
        <div className="panel bg-overlay p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="label !mb-0">{meta.keyLabel ?? 'Credentials'}</span>
            {hasKey ? (
              <span className="chip border-emerald-500/40 text-emerald-300">
                <CheckIcon className="w-3.5 h-3.5" /> Stored & encrypted
              </span>
            ) : (
              <span className="chip">Not set</span>
            )}
          </div>

          {meta.needsKey && (
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  className="field pr-9"
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={hasKey ? 'Enter a new key to replace…' : meta.keyPlaceholder}
                />
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-content-faint hover:text-content"
                  onClick={() => setShowKey((v) => !v)}
                  type="button"
                  aria-label="Toggle visibility"
                >
                  {showKey ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
              <button className="btn-primary" onClick={onSaveKey} disabled={busy || !keyInput.trim()}>
                Save key
              </button>
            </div>
          )}

          {meta.supportsDeviceFlow && (
            <div className="flex items-center gap-2">
              <button className="btn-outline" onClick={onDeviceLogin} disabled={busy}>
                Sign in with GitHub (device)
              </button>
              <span className="text-[11px] text-content-faint">
                Opens github.com to authorize this device.
              </span>
            </div>
          )}

          {hasKey && (
            <button className="btn-danger !py-1.5" onClick={onRemoveKey} disabled={busy}>
              <TrashIcon className="w-4 h-4" /> Remove stored credential
            </button>
          )}

          {deviceCode && (
            <div className="rounded-lg border border-neon/40 bg-neon/5 p-3 text-sm">
              <p className="text-content-muted text-xs mb-1">Enter this code at {deviceCode.verificationUri}:</p>
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg tracking-[0.3em] text-neon neon-text">
                  {deviceCode.userCode}
                </span>
                <button
                  className="btn-ghost !py-1"
                  onClick={() => void api.shell.openExternal(deviceCode.verificationUri)}
                >
                  Open page
                </button>
              </div>
              <p className="text-[11px] text-content-faint mt-1">Waiting for authorization…</p>
            </div>
          )}
        </div>
      )}

      {test && (
        <div
          className={`text-xs rounded-lg px-3 py-2 border ${
            test.ok
              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
              : 'text-red-300 bg-red-500/10 border-red-500/30'
          }`}
        >
          {test.message}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {existing && (
          <button className="btn-danger" onClick={onDelete} disabled={busy}>
            <TrashIcon className="w-4 h-4" /> Delete
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button className="btn-outline" onClick={onTest} disabled={busy}>
            Test connection
          </button>
          <button className="btn-primary" onClick={onSave} disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
