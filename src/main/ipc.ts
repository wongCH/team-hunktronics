import { ipcMain, shell, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import type {
  AgentConfig,
  ApiTrace,
  AppSettings,
  ChatRequest,
  ConnectionConfig,
  Conversation,
  ModelInfo,
  ProviderType,
  TestResult
} from '@shared/types';
import { PROVIDER_META } from '@shared/types';
import { IPC } from '@shared/ipc';
import type { DeviceFlowResult } from '@shared/ipc';
import type { Store } from './store';
import type { Vault } from './vault';
import { getProvider, type ProviderContext } from './providers';
import { startDeviceFlow, type DeviceFlowHandle } from './github/deviceFlow';

const VALID_TYPES: ProviderType[] = [
  'ollama',
  'openai',
  'anthropic',
  'github-models',
  'openai-compatible',
  'copilot'
];

interface Deps {
  getWindow: () => BrowserWindow | null;
  store: Store;
  vault: Vault;
}

export function registerIpc({ getWindow, store, vault }: Deps): void {
  const activeStreams = new Map<string, AbortController>();
  let deviceFlow: DeviceFlowHandle | null = null;

  const send = (channel: string, payload: unknown): void => {
    getWindow()?.webContents.send(channel, payload);
  };

  async function buildContext(conn: ConnectionConfig): Promise<ProviderContext> {
    const meta = PROVIDER_META[conn.providerType];
    const apiKey =
      meta.needsKey || meta.supportsDeviceFlow ? await vault.getSecret(conn.id) : null;
    return { baseUrl: conn.baseUrl, apiKey };
  }

  function validateConnection(input: unknown): ConnectionConfig {
    const c = input as Partial<ConnectionConfig>;
    if (!c || typeof c !== 'object') throw new Error('Invalid connection payload.');
    if (!c.providerType || !VALID_TYPES.includes(c.providerType)) {
      throw new Error('Invalid provider type.');
    }
    const label = (c.label ?? '').toString().trim();
    if (!label) throw new Error('A connection name is required.');
    const now = Date.now();
    return {
      id: c.id && typeof c.id === 'string' ? c.id : randomUUID(),
      providerType: c.providerType,
      label: label.slice(0, 120),
      baseUrl: c.baseUrl ? c.baseUrl.toString().trim() : undefined,
      defaultModel: c.defaultModel ? c.defaultModel.toString().trim() : undefined,
      hasKey: false,
      createdAt: c.createdAt ?? now,
      updatedAt: now
    };
  }

  // ---- Vault status ----
  ipcMain.handle(IPC.vaultStatus, () => ({
    available: vault.isAvailable(),
    backend: vault.backendName()
  }));

  // ---- Connections ----
  ipcMain.handle(IPC.connectionsList, () => store.listConnections());

  ipcMain.handle(IPC.connectionsUpsert, async (_e, input: unknown) => {
    const conn = validateConnection(input);
    conn.hasKey = await vault.hasSecret(conn.id);
    return store.upsertConnection(conn);
  });

  ipcMain.handle(IPC.connectionsRemove, async (_e, id: string) => {
    await vault.clearSecret(id);
    return store.removeConnection(id);
  });

  ipcMain.handle(IPC.connectionsTest, async (_e, id: string): Promise<TestResult> => {
    try {
      const conn = await store.getConnection(id);
      if (!conn) return { ok: false, message: 'Connection not found.' };
      const provider = getProvider(conn.providerType);
      const models = await provider.listModels(await buildContext(conn));
      return {
        ok: true,
        message: models.length
          ? `Connected — ${models.length} model(s) available.`
          : 'Connected. No model list returned; you can enter a model name manually.',
        models
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  });

  // ---- Secrets (write-only from renderer's perspective) ----
  ipcMain.handle(IPC.secretsSet, async (_e, id: string, secret: string) => {
    if (!secret || !secret.trim()) throw new Error('Secret cannot be empty.');
    await vault.setSecret(id, secret.trim());
    const conn = await store.getConnection(id);
    if (conn) await store.upsertConnection({ ...conn, hasKey: true, updatedAt: Date.now() });
    return { ok: true };
  });

  ipcMain.handle(IPC.secretsClear, async (_e, id: string) => {
    await vault.clearSecret(id);
    const conn = await store.getConnection(id);
    if (conn) await store.upsertConnection({ ...conn, hasKey: false, updatedAt: Date.now() });
    return { ok: true };
  });

  ipcMain.handle(IPC.secretsHas, (_e, id: string) => vault.hasSecret(id));

  // ---- Models ----
  ipcMain.handle(IPC.modelsList, async (_e, id: string): Promise<ModelInfo[]> => {
    const conn = await store.getConnection(id);
    if (!conn) throw new Error('Connection not found.');
    const provider = getProvider(conn.providerType);
    return provider.listModels(await buildContext(conn));
  });

  // ---- API traces ----
  ipcMain.handle(IPC.tracesList, () => store.listApiTraces());
  ipcMain.handle(IPC.tracesClear, () => store.clearApiTraces());

  // ---- Chat (streaming) ----
  ipcMain.handle(IPC.chatSend, async (_e, req: ChatRequest): Promise<{ streamId: string }> => {
    const conn = await store.getConnection(req.connectionId);
    if (!conn) throw new Error('Connection not found.');
    if (!req.model) throw new Error('No model selected.');
    if (conn.providerType === 'copilot') {
      const settings = await store.getSettings();
      if (!settings.experimentalCopilot) {
        throw new Error('Enable experimental Copilot support in Settings to use this connection.');
      }
    }

    const provider = getProvider(conn.providerType);
    const ctx = await buildContext(conn);
    const streamId = randomUUID();
    const controller = new AbortController();
    activeStreams.set(streamId, controller);
    const startedAt = Date.now();
    const traceBase: ApiTrace = {
      id: randomUUID(),
      streamId,
      providerType: conn.providerType,
      connectionId: conn.id,
      model: req.model,
      request: {
        messages: req.messages,
        params: req.params,
        startedAt
      },
      response: {
        content: '',
        chunks: 0,
        doneAt: null,
        error: null,
        cancelled: false
      },
      context: {
        source: req.traceContext?.source ?? 'chat',
        agentId: req.traceContext?.agentId ?? null,
        agentName: req.traceContext?.agentName ?? null
      },
      status: 'streaming',
      createdAt: startedAt,
      updatedAt: startedAt
    };
    let trace = traceBase;
    let traceWriteQueue = Promise.resolve();
    const queueTrace = (next: ApiTrace): Promise<void> => {
      trace = next;
      traceWriteQueue = traceWriteQueue.then(async () => {
        await store.saveApiTrace(next);
        send(IPC.traceUpdate, { trace: next });
      });
      return traceWriteQueue;
    };
    await queueTrace(trace);

    // Run in the background; stream chunks over IPC events.
    void (async () => {
      try {
        await provider.streamChat(ctx, req.model, req.messages, req.params, controller.signal, {
          onChunk: (delta) => {
            send(IPC.chatChunk, { streamId, delta });
            void queueTrace({
              ...trace,
              response: {
                ...trace.response,
                content: trace.response.content + delta,
                chunks: trace.response.chunks + 1
              },
              updatedAt: Date.now()
            });
          }
        });
        const doneAt = Date.now();
        await queueTrace({
          ...trace,
          status: 'done',
          response: {
            ...trace.response,
            doneAt
          },
          updatedAt: doneAt
        });
        send(IPC.chatDone, { streamId });
      } catch (err) {
        const message =
          (err as Error)?.name === 'AbortError'
            ? 'Generation stopped.'
            : (err as Error).message || 'Unknown error.';
        const doneAt = Date.now();
        await queueTrace({
          ...trace,
          status: (err as Error)?.name === 'AbortError' ? 'cancelled' : 'error',
          response: {
            ...trace.response,
            doneAt,
            error: message,
            cancelled: (err as Error)?.name === 'AbortError'
          },
          updatedAt: doneAt
        });
        send(IPC.chatError, { streamId, message });
      } finally {
        activeStreams.delete(streamId);
      }
    })();

    return { streamId };
  });

  ipcMain.handle(IPC.chatCancel, (_e, streamId: string) => {
    activeStreams.get(streamId)?.abort();
    activeStreams.delete(streamId);
    return { ok: true };
  });

  // ---- Conversations ----
  ipcMain.handle(IPC.conversationsList, () => store.listConversations());
  ipcMain.handle(IPC.conversationsSave, (_e, conv: Conversation) => store.saveConversation(conv));
  ipcMain.handle(IPC.conversationsDelete, (_e, id: string) => store.deleteConversation(id));

  // ---- Agents ----
  ipcMain.handle(IPC.agentsList, () => store.listAgents());
  ipcMain.handle(IPC.agentsSave, (_e, agent: AgentConfig) => store.saveAgent(agent));
  ipcMain.handle(IPC.agentsDelete, (_e, id: string) => store.deleteAgent(id));

  // ---- Settings ----
  ipcMain.handle(IPC.settingsGet, () => store.getSettings());
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<AppSettings>) => store.setSettings(patch));

  // ---- GitHub device flow ----
  ipcMain.handle(
    IPC.githubStartDeviceFlow,
    async (_e, connectionId: string, scope?: string): Promise<DeviceFlowResult> => {
      try {
        const conn = await store.getConnection(connectionId);
        if (!conn) return { ok: false, stored: false, message: 'Connection not found.' };
        const settings = await store.getSettings();

        deviceFlow = startDeviceFlow({
          clientId: settings.githubClientId,
          scope: scope ?? 'read:user',
          onCode: (code) => send(IPC.githubDeviceCode, code)
        });

        const token = await deviceFlow.promise;
        deviceFlow = null;
        await vault.setSecret(connectionId, token);
        await store.upsertConnection({ ...conn, hasKey: true, updatedAt: Date.now() });
        return { ok: true, stored: true, message: 'Signed in with GitHub.' };
      } catch (err) {
        deviceFlow = null;
        return { ok: false, stored: false, message: (err as Error).message };
      }
    }
  );

  ipcMain.handle(IPC.githubCancelDeviceFlow, () => {
    deviceFlow?.cancel();
    deviceFlow = null;
    return { ok: true };
  });

  // ---- Shell ----
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { ok: true };
  });
}
