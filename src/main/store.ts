import { promises as fs } from 'fs';
import { join } from 'path';
import type { AppSettings, ConnectionConfig, Conversation } from '@shared/types';
import { DEFAULT_GITHUB_CLIENT_ID } from '@shared/types';

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'neon-blue',
  experimentalCopilot: false,
  activeConnectionId: null,
  activeModel: null,
  githubClientId: DEFAULT_GITHUB_CLIENT_ID
};

/** Plaintext (non-secret) persistence for connections, conversations, and settings. */
export class Store {
  private readonly connectionsFile: string;
  private readonly conversationsFile: string;
  private readonly settingsFile: string;

  constructor(dir: string) {
    this.connectionsFile = join(dir, 'connections.json');
    this.conversationsFile = join(dir, 'conversations.json');
    this.settingsFile = join(dir, 'settings.json');
  }

  listConnections(): Promise<ConnectionConfig[]> {
    return readJson<ConnectionConfig[]>(this.connectionsFile, []);
  }

  async getConnection(id: string): Promise<ConnectionConfig | undefined> {
    return (await this.listConnections()).find((c) => c.id === id);
  }

  async upsertConnection(conn: ConnectionConfig): Promise<ConnectionConfig[]> {
    const list = await this.listConnections();
    const idx = list.findIndex((c) => c.id === conn.id);
    if (idx >= 0) list[idx] = conn;
    else list.push(conn);
    await writeJson(this.connectionsFile, list);
    return list;
  }

  async removeConnection(id: string): Promise<ConnectionConfig[]> {
    const list = (await this.listConnections()).filter((c) => c.id !== id);
    await writeJson(this.connectionsFile, list);
    return list;
  }

  listConversations(): Promise<Conversation[]> {
    return readJson<Conversation[]>(this.conversationsFile, []);
  }

  async saveConversation(conv: Conversation): Promise<Conversation[]> {
    const list = await this.listConversations();
    const idx = list.findIndex((c) => c.id === conv.id);
    if (idx >= 0) list[idx] = conv;
    else list.unshift(conv);
    await writeJson(this.conversationsFile, list);
    return list;
  }

  async deleteConversation(id: string): Promise<Conversation[]> {
    const list = (await this.listConversations()).filter((c) => c.id !== id);
    await writeJson(this.conversationsFile, list);
    return list;
  }

  async getSettings(): Promise<AppSettings> {
    const partial = await readJson<Partial<AppSettings>>(this.settingsFile, {});
    return { ...DEFAULT_SETTINGS, ...partial };
  }

  async setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = { ...(await this.getSettings()), ...patch };
    await writeJson(this.settingsFile, next);
    return next;
  }
}
