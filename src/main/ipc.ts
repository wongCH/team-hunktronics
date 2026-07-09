import { ipcMain, shell, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import type {
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

    // Run in the background; stream chunks over IPC events.
    void (async () => {
      try {
        await provider.streamChat(ctx, req.model, req.messages, req.params, controller.signal, {
          onChunk: (delta) => send(IPC.chatChunk, { streamId, delta })
        });
        send(IPC.chatDone, { streamId });
      } catch (err) {
        const message =
          (err as Error)?.name === 'AbortError'
            ? 'Generation stopped.'
            : (err as Error).message || 'Unknown error.';
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
