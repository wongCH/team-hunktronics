import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppSettings, ConnectionConfig, Conversation } from '@shared/types';
import type { Store } from './store';
import type { Vault } from './vault';

/**
 * Backlog coverage: US-101/US-102 (connection CRUD + test), US-202 (write-only
 * secrets kept in sync), US-302 (cancel), US-501 (device-flow wiring), plus
 * FR-CHAT-04 Copilot gating and SEC-05/07 external-link handling.
 *
 * The Electron `ipcMain`, provider registry and device flow are mocked so we can
 * drive the registered handlers directly with in-memory Store/Vault doubles.
 */
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}));

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) },
  shell: { openExternal: vi.fn() },
  BrowserWindow: class {}
}));
vi.mock('./providers', () => ({ getProvider: vi.fn() }));
vi.mock('./github/deviceFlow', () => ({ startDeviceFlow: vi.fn() }));

import { shell } from 'electron';
import { getProvider } from './providers';
import { startDeviceFlow } from './github/deviceFlow';
import { registerIpc } from './ipc';
import { IPC } from '@shared/ipc';

const getProviderMock = getProvider as unknown as ReturnType<typeof vi.fn>;
const startDeviceFlowMock = startDeviceFlow as unknown as ReturnType<typeof vi.fn>;
const openExternalMock = shell.openExternal as unknown as ReturnType<typeof vi.fn>;

class FakeStore {
  connections: ConnectionConfig[] = [];
  conversations: Conversation[] = [];
  settings: AppSettings = {
    theme: 'neon-blue',
    experimentalCopilot: false,
    activeConnectionId: null,
    activeModel: null,
    githubClientId: 'Iv1.default'
  };
  async listConnections() {
    return this.connections;
  }
  async getConnection(id: string) {
    return this.connections.find((c) => c.id === id);
  }
  async upsertConnection(conn: ConnectionConfig) {
    const i = this.connections.findIndex((c) => c.id === conn.id);
    if (i >= 0) this.connections[i] = conn;
    else this.connections.push(conn);
    return this.connections;
  }
  async removeConnection(id: string) {
    this.connections = this.connections.filter((c) => c.id !== id);
    return this.connections;
  }
  async listConversations() {
    return this.conversations;
  }
  async saveConversation(conv: Conversation) {
    this.conversations.unshift(conv);
    return this.conversations;
  }
  async deleteConversation(id: string) {
    this.conversations = this.conversations.filter((c) => c.id !== id);
    return this.conversations;
  }
  async getSettings() {
    return this.settings;
  }
  async setSettings(patch: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...patch };
    return this.settings;
  }
}

class FakeVault {
  secrets = new Map<string, string>();
  available = true;
  isAvailable() {
    return this.available;
  }
  backendName() {
    return this.available ? 'macOS Keychain' : 'unavailable';
  }
  async getSecret(id: string) {
    return this.secrets.get(id) ?? null;
  }
  async setSecret(id: string, secret: string) {
    this.secrets.set(id, secret);
  }
  async hasSecret(id: string) {
    return this.secrets.has(id);
  }
  async clearSecret(id: string) {
    this.secrets.delete(id);
  }
}

let store: FakeStore;
let vault: FakeVault;
let send: ReturnType<typeof vi.fn>;

const invoke = (channel: string, ...args: unknown[]): unknown =>
  handlers.get(channel)!(null, ...args);

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function connection(over: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: 'c1',
    providerType: 'openai',
    label: 'My OpenAI',
    hasKey: false,
    createdAt: 1,
    updatedAt: 1,
    ...over
  };
}

beforeEach(() => {
  handlers.clear();
  store = new FakeStore();
  vault = new FakeVault();
  send = vi.fn();
  getProviderMock.mockReset();
  startDeviceFlowMock.mockReset();
  registerIpc({
    getWindow: () => ({ webContents: { send } }) as never,
    store: store as unknown as Store,
    vault: vault as unknown as Vault
  });
});

describe('vault status', () => {
  it('reports availability and backend name', async () => {
    expect(await invoke(IPC.vaultStatus)).toEqual({ available: true, backend: 'macOS Keychain' });
  });
});

describe('connections (US-101)', () => {
  it('validates and creates a connection, seeding hasKey from the vault', async () => {
    vault.secrets.set('c1', 'sk-existing');
    const list = (await invoke(IPC.connectionsUpsert, connection())) as ConnectionConfig[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ label: 'My OpenAI', providerType: 'openai', hasKey: true });
  });

  it('rejects a connection without a label', async () => {
    await expect(invoke(IPC.connectionsUpsert, { providerType: 'openai' })).rejects.toThrow(
      /connection name is required/i
    );
  });

  it('rejects an invalid provider type', async () => {
    await expect(
      invoke(IPC.connectionsUpsert, { providerType: 'bogus', label: 'x' })
    ).rejects.toThrow(/invalid provider type/i);
  });

  it('clears the stored secret when a connection is removed', async () => {
    store.connections = [connection()];
    vault.secrets.set('c1', 'sk-x');
    await invoke(IPC.connectionsRemove, 'c1');
    expect(vault.secrets.has('c1')).toBe(false);
    expect(store.connections).toHaveLength(0);
  });
});

describe('connection test (US-102)', () => {
  it('reports success with the discovered model count', async () => {
    store.connections = [connection()];
    getProviderMock.mockReturnValue({ listModels: vi.fn(async () => [{ id: 'a' }, { id: 'b' }]) });
    const res = (await invoke(IPC.connectionsTest, 'c1')) as { ok: boolean; message: string };
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/2 model\(s\)/);
  });

  it('reports failure with the provider error message', async () => {
    store.connections = [connection()];
    getProviderMock.mockReturnValue({
      listModels: vi.fn(async () => {
        throw new Error('401 unauthorized');
      })
    });
    const res = (await invoke(IPC.connectionsTest, 'c1')) as { ok: boolean; message: string };
    expect(res).toMatchObject({ ok: false, message: '401 unauthorized' });
  });

  it('reports when the connection does not exist', async () => {
    expect(await invoke(IPC.connectionsTest, 'missing')).toMatchObject({ ok: false });
  });
});

describe('secrets stay write-only and in sync (US-202)', () => {
  it('stores a trimmed secret and flips hasKey to true', async () => {
    store.connections = [connection()];
    const res = await invoke(IPC.secretsSet, 'c1', '  sk-token  ');
    expect(res).toEqual({ ok: true });
    expect(vault.secrets.get('c1')).toBe('sk-token');
    expect((await store.getConnection('c1'))?.hasKey).toBe(true);
  });

  it('rejects an empty secret', async () => {
    await expect(invoke(IPC.secretsSet, 'c1', '   ')).rejects.toThrow(/cannot be empty/i);
  });

  it('clears a secret and flips hasKey to false', async () => {
    store.connections = [connection({ hasKey: true })];
    vault.secrets.set('c1', 'sk');
    await invoke(IPC.secretsClear, 'c1');
    expect(vault.secrets.has('c1')).toBe(false);
    expect((await store.getConnection('c1'))?.hasKey).toBe(false);
  });

  it('exposes only presence via secrets:has', async () => {
    vault.secrets.set('c1', 'sk');
    expect(await invoke(IPC.secretsHas, 'c1')).toBe(true);
    expect(await invoke(IPC.secretsHas, 'other')).toBe(false);
  });
});

describe('chat (US-302 / FR-CHAT-04)', () => {
  it('streams chunks then a done event and returns a stream id', async () => {
    store.connections = [connection()];
    getProviderMock.mockReturnValue({
      listModels: vi.fn(),
      streamChat: vi.fn(async (_ctx, _model, _msgs, _params, _signal, cb) => cb.onChunk('Hi'))
    });
    const res = (await invoke(IPC.chatSend, {
      connectionId: 'c1',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }]
    })) as { streamId: string };
    expect(res.streamId).toEqual(expect.any(String));

    await tick();
    const channels = send.mock.calls.map((c) => c[0]);
    expect(channels).toContain(IPC.chatChunk);
    expect(channels).toContain(IPC.chatDone);
    const chunk = send.mock.calls.find((c) => c[0] === IPC.chatChunk)?.[1];
    expect(chunk).toMatchObject({ streamId: res.streamId, delta: 'Hi' });
  });

  it('rejects when no model is selected', async () => {
    store.connections = [connection()];
    await expect(
      invoke(IPC.chatSend, { connectionId: 'c1', model: '', messages: [] })
    ).rejects.toThrow(/no model selected/i);
  });

  it('gates the experimental Copilot provider behind the setting (FR-CHAT-04)', async () => {
    store.connections = [connection({ providerType: 'copilot' })];
    store.settings.experimentalCopilot = false;
    await expect(
      invoke(IPC.chatSend, { connectionId: 'c1', model: 'gpt-4o', messages: [] })
    ).rejects.toThrow(/experimental Copilot/i);
  });

  it('acknowledges a cancel request', async () => {
    expect(await invoke(IPC.chatCancel, 'any-id')).toEqual({ ok: true });
  });
});

describe('github device flow (US-501 wiring)', () => {
  it('stores the returned token as the connection secret', async () => {
    store.connections = [connection({ providerType: 'github-models' })];
    startDeviceFlowMock.mockReturnValue({ promise: Promise.resolve('gho_tok'), cancel: vi.fn() });

    const res = await invoke(IPC.githubStartDeviceFlow, 'c1', 'read:user');
    expect(res).toMatchObject({ ok: true, stored: true });
    expect(vault.secrets.get('c1')).toBe('gho_tok');
    expect((await store.getConnection('c1'))?.hasKey).toBe(true);
    expect(startDeviceFlowMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'Iv1.default', scope: 'read:user' })
    );
  });

  it('fails gracefully for an unknown connection', async () => {
    expect(await invoke(IPC.githubStartDeviceFlow, 'missing')).toMatchObject({
      ok: false,
      stored: false
    });
  });
});

describe('external links (SEC-05 / SEC-07)', () => {
  it('opens http(s) urls in the OS browser', async () => {
    await invoke(IPC.openExternal, 'https://example.com');
    expect(openExternalMock).toHaveBeenCalledWith('https://example.com');
  });

  it('refuses non-http schemes', async () => {
    const res = await invoke(IPC.openExternal, 'file:///etc/passwd');
    expect(res).toEqual({ ok: true });
    expect(openExternalMock).not.toHaveBeenCalled();
  });
});
