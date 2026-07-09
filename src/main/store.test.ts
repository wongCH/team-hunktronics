import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Store } from './store';
import { DEFAULT_GITHUB_CLIENT_ID } from '@shared/types';
import type { ConnectionConfig, Conversation } from '@shared/types';

/**
 * Backlog coverage: US-101 (manage connections), US-401 (conversation CRUD),
 * US-402 (persist across restarts), NFR-REL-02 (safe defaults on missing/corrupt files).
 */

function conn(id: string, label = 'C ' + id): ConnectionConfig {
  return {
    id,
    providerType: 'openai',
    label,
    hasKey: false,
    createdAt: 1,
    updatedAt: 1
  };
}

function convo(id: string, title = 'Chat ' + id): Conversation {
  return {
    id,
    title,
    connectionId: null,
    model: null,
    messages: [],
    createdAt: 1,
    updatedAt: 1
  };
}

let dir: string;
let store: Store;

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'acp-store-'));
  store = new Store(dir);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('Store — connections (US-101)', () => {
  it('starts empty and adds a connection on upsert', async () => {
    expect(await store.listConnections()).toEqual([]);
    const list = await store.upsertConnection(conn('a'));
    expect(list).toHaveLength(1);
    expect(await store.getConnection('a')).toMatchObject({ id: 'a', providerType: 'openai' });
  });

  it('updates an existing connection in place (same id)', async () => {
    await store.upsertConnection(conn('a', 'first'));
    const list = await store.upsertConnection(conn('a', 'renamed'));
    expect(list).toHaveLength(1);
    expect((await store.getConnection('a'))?.label).toBe('renamed');
  });

  it('removes a connection by id', async () => {
    await store.upsertConnection(conn('a'));
    await store.upsertConnection(conn('b'));
    const list = await store.removeConnection('a');
    expect(list.map((c) => c.id)).toEqual(['b']);
    expect(await store.getConnection('a')).toBeUndefined();
  });

  it('persists connections across Store instances (US-402-style reload)', async () => {
    await store.upsertConnection(conn('a'));
    const reopened = new Store(dir);
    expect((await reopened.listConnections()).map((c) => c.id)).toEqual(['a']);
  });
});

describe('Store — conversations (US-401 / US-402)', () => {
  it('prepends new conversations and reloads them', async () => {
    await store.saveConversation(convo('a'));
    await store.saveConversation(convo('b'));
    const list = await store.listConversations();
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);

    const reopened = new Store(dir);
    expect((await reopened.listConversations()).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('updates an existing conversation without duplicating it', async () => {
    await store.saveConversation(convo('a', 'v1'));
    await store.saveConversation(convo('a', 'v2'));
    const list = await store.listConversations();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('v2');
  });

  it('deletes a conversation by id', async () => {
    await store.saveConversation(convo('a'));
    await store.saveConversation(convo('b'));
    const list = await store.deleteConversation('a');
    expect(list.map((c) => c.id)).toEqual(['b']);
  });
});

describe('Store — settings', () => {
  it('returns defaults when nothing is persisted', async () => {
    const s = await store.getSettings();
    expect(s).toMatchObject({
      theme: 'neon-blue',
      experimentalCopilot: false,
      activeConnectionId: null,
      activeModel: null,
      githubClientId: DEFAULT_GITHUB_CLIENT_ID
    });
  });

  it('merges a partial patch over existing settings and persists it', async () => {
    await store.setSettings({ activeConnectionId: 'x', activeModel: 'gpt-4o' });
    const merged = await store.setSettings({ experimentalCopilot: true });
    expect(merged).toMatchObject({
      activeConnectionId: 'x',
      activeModel: 'gpt-4o',
      experimentalCopilot: true
    });
    expect(await new Store(dir).getSettings()).toMatchObject({ activeConnectionId: 'x' });
  });
});

describe('Store — reliability (NFR-REL-02)', () => {
  it('falls back to defaults when a data file is corrupt', async () => {
    await fs.writeFile(join(dir, 'connections.json'), '{ not valid json ');
    await fs.writeFile(join(dir, 'settings.json'), 'also broken');
    expect(await store.listConnections()).toEqual([]);
    expect(await store.getSettings()).toMatchObject({ theme: 'neon-blue' });
  });
});
