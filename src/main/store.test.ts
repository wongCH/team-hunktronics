import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Store } from './store';
import { DEFAULT_GITHUB_CLIENT_ID } from '@shared/types';
import type { AgentSchedule, AgentTask, ApiTrace, ConnectionConfig, Conversation } from '@shared/types';

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

function trace(id: string, content = 'ok'): ApiTrace {
  return {
    id,
    streamId: 's-' + id,
    providerType: 'openai',
    connectionId: 'c1',
    model: 'gpt-4o',
    request: {
      messageCount: 1,
      characterCount: 5,
      hasSystemContext: false,
      startedAt: 1
    },
    response: {
      preview: content,
      characterCount: content.length,
      truncated: false,
      chunks: 1,
      doneAt: 2,
      error: null,
      cancelled: false
    },
    context: {
      source: 'agent',
      agentId: 'a1',
      agentName: 'Agent 1'
    },
    status: 'done',
    createdAt: 1,
    updatedAt: 2
  };
}

function task(id: string, title = `Task ${id}`): AgentTask {
  return {
    id,
    title,
    description: '',
    status: 'backlog',
    priority: 'medium',
    agentId: null,
    conversationId: null,
    currentRunId: null,
    lastError: null,
    createdAt: 1,
    updatedAt: 1
  };
}

function schedule(id: string): AgentSchedule {
  return {
    id,
    name: `Schedule ${id}`,
    agentId: 'agent-1',
    prompt: 'Run focused work.',
    cron: '0 9 * * *',
    timeZone: 'UTC',
    enabled: true,
    maxAttempts: 1,
    nextRunAt: 10,
    lastRunAt: null,
    lastRunStatus: 'idle',
    lastError: null,
    conversationId: null,
    currentRunId: null,
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

describe('Store — API traces', () => {
  it('stores traces and keeps newest first', async () => {
    await store.saveApiTrace(trace('a', 'first'));
    await store.saveApiTrace(trace('b', 'second'));
    const list = await store.listApiTraces();
    expect(list.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('updates an existing trace without duplication', async () => {
    await store.saveApiTrace(trace('a', 'first'));
    await store.saveApiTrace(trace('a', 'updated response'));
    const list = await store.listApiTraces();
    expect(list).toHaveLength(1);
    expect(list[0].response.preview).toBe('updated response');
  });

  it('clears all traces', async () => {
    await store.saveApiTrace(trace('a'));
    await store.clearApiTraces();
    expect(await store.listApiTraces()).toEqual([]);
  });
});

describe('Store — tasks', () => {
  it('creates, updates, reloads, and deletes durable tasks', async () => {
    await store.saveTask(task('a'));
    await store.saveTask(task('a', 'Updated'));
    expect(await store.listTasks()).toEqual([expect.objectContaining({ id: 'a', title: 'Updated' })]);
    expect(await new Store(dir).getTask('a')).toMatchObject({ title: 'Updated' });
    await store.deleteTask('a');
    expect(await store.listTasks()).toEqual([]);
  });
});

describe('Store — schedules', () => {
  it('creates, reloads, and deletes schedules', async () => {
    await store.saveSchedule(schedule('a'));
    expect(await new Store(dir).getSchedule('a')).toMatchObject({ name: 'Schedule a' });
    await store.deleteSchedule('a');
    expect(await store.listSchedules()).toEqual([]);
  });
});

describe('Store — reliability (NFR-REL-02)', () => {
  it('reports corruption instead of silently returning an empty collection', async () => {
    await fs.writeFile(join(dir, 'connections.json'), '{ not valid json ');
    await fs.writeFile(join(dir, 'settings.json'), 'also broken');
    await expect(store.listConnections()).rejects.toThrow(/corrupt.*connections\.json/i);
    await expect(store.getSettings()).rejects.toThrow(/corrupt.*settings\.json/i);
  });

  it('recovers the last valid snapshot when the primary file is corrupt', async () => {
    await store.upsertConnection(conn('a'));
    await store.upsertConnection(conn('b'));
    await fs.writeFile(join(dir, 'connections.json'), '{ not valid json ');

    expect(await store.listConnections()).toEqual([expect.objectContaining({ id: 'a' })]);
  });
});

describe('Store — local data explorer', () => {
  it('searches an allow-listed collection and reports result counts', async () => {
    await store.upsertConnection(conn('a', 'Local Ollama'));
    await store.upsertConnection(conn('b', 'Cloud OpenAI'));

    const result = await store.queryLocalData({
      collection: 'connections',
      search: 'ollama',
      limit: 10
    });

    expect(result).toMatchObject({ total: 2, matched: 1, returned: 1, truncated: false });
    expect(result.rows[0]).toMatchObject({ id: 'a', label: 'Local Ollama' });
  });

  it('caps row limits and rejects collections outside the allow-list', async () => {
    await store.saveConversation(convo('a'));
    await store.saveConversation(convo('b'));

    const result = await store.queryLocalData({ collection: 'conversations', limit: 1 });
    expect(result).toMatchObject({ total: 2, matched: 2, returned: 1, truncated: true });

    await expect(store.queryLocalData({ collection: 'vault' as never })).rejects.toThrow(
      /invalid local data collection/i
    );
  });
});
