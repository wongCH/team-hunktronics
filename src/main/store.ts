import { promises as fs } from 'fs';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import type {
  Approval,
  AgentPipeline,
  AgentSchedule,
  AgentTask,
  AgentConfig,
  ApiTrace,
  AppSettings,
  ConnectionConfig,
  Conversation,
  PipelineExecution,
  RunArtifact,
  SkillDefinition,
  ToolAction,
  LocalDataCollection,
  LocalDataQuery,
  LocalDataResult
} from '@shared/types';
import { DEFAULT_APP_THEME, DEFAULT_GITHUB_CLIENT_ID, isAppTheme } from '@shared/types';
import { normalizeTeam, validateTeam } from './teamGraph';

type PersistedAgent = Omit<AgentConfig, 'soul'> & { soul?: string };

const SAFE_AGENT_ID = /^[a-zA-Z0-9_-]{1,200}$/;
const MAX_CAPABILITY_CHARS = 500;

function soulPathFor(agentId: string): string {
  return `agents/${agentId}/SOUL.md`;
}

function capabilityManifest(agent: AgentConfig): string {
  const identity = agent.soul.trim() || agent.capabilities?.trim() || '';
  return [agent.name, agent.title, agent.skills.join(' '), identity]
    .filter(Boolean)
    .join(' · ')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_CAPABILITY_CHARS);
}

function toAgentShell(agent: PersistedAgent): AgentConfig {
  return {
    ...agent,
    soul: '',
    soulPath: soulPathFor(agent.id),
    capabilities:
      agent.capabilities?.trim().slice(0, MAX_CAPABILITY_CHARS) ??
      capabilityManifest({ ...agent, soul: agent.soul ?? '' })
  };
}

function toPersistedAgent(agent: AgentConfig): PersistedAgent {
  const { soul: _soul, ...metadata } = agent;
  return {
    ...metadata,
    soulPath: soulPathFor(agent.id),
    capabilities: capabilityManifest(agent)
  };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    try {
      const backup = await fs.readFile(`${file}.bak`, 'utf-8');
      return JSON.parse(backup) as T;
    } catch {
      throw new Error(`Stored data is corrupt and no valid backup is available: ${basename(file)}`);
    }
  }
}

const writeQueues = new Map<string, Promise<void>>();

async function atomicWriteText(file: string, content: string): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
  const temporary = join(dirname(file), `.${basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const handle = await fs.open(temporary, 'w', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

async function writeJsonNow(file: string, data: unknown): Promise<void> {
  try {
    const current = await fs.readFile(file, 'utf8');
    JSON.parse(current);
    await atomicWriteText(`${file}.bak`, current);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      throw error;
    }
  }
  await atomicWriteText(file, JSON.stringify(data, null, 2));
}

async function writeJson(file: string, data: unknown): Promise<void> {
  const previous = writeQueues.get(file) ?? Promise.resolve();
  const current = previous.then(() => writeJsonNow(file, data));
  writeQueues.set(file, current);
  try {
    await current;
  } finally {
    if (writeQueues.get(file) === current) writeQueues.delete(file);
  }
}

async function updateJson<T>(file: string, fallback: T, update: (current: T) => T): Promise<T> {
  const previous = writeQueues.get(file) ?? Promise.resolve();
  let result!: T;
  const current = previous.then(async () => {
    result = update(await readJson(file, fallback));
    await writeJsonNow(file, result);
  });
  writeQueues.set(file, current);
  try {
    await current;
    return result;
  } finally {
    if (writeQueues.get(file) === current) writeQueues.delete(file);
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: DEFAULT_APP_THEME,
  experimentalCopilot: false,
  activeConnectionId: null,
  activeModel: null,
  llmWikiPath: null,
  githubClientId: DEFAULT_GITHUB_CLIENT_ID
};

/** Plaintext (non-secret) persistence for connections, conversations, and settings. */
export class Store {
  private readonly root: string;
  private readonly connectionsFile: string;
  private readonly conversationsFile: string;
  private readonly agentsFile: string;
  private readonly tasksFile: string;
  private readonly schedulesFile: string;
  private readonly pipelinesFile: string;
  private readonly pipelineExecutionsFile: string;
  private readonly artifactsFile: string;
  private readonly toolActionsFile: string;
  private readonly approvalsFile: string;
  private readonly skillsFile: string;
  private readonly tracesFile: string;
  private readonly settingsFile: string;
  private agentMutationQueue: Promise<void> = Promise.resolve();
  private agentMigration: Promise<void> | null = null;
  private agentsCache: AgentConfig[] | null = null;

  constructor(dir: string) {
    this.root = resolve(dir);
    this.connectionsFile = join(dir, 'connections.json');
    this.conversationsFile = join(dir, 'conversations.json');
    this.agentsFile = join(dir, 'agents.json');
    this.tasksFile = join(dir, 'tasks.json');
    this.schedulesFile = join(dir, 'schedules.json');
    this.pipelinesFile = join(dir, 'pipelines.json');
    this.pipelineExecutionsFile = join(dir, 'pipeline-executions.json');
    this.artifactsFile = join(dir, 'artifacts.json');
    this.toolActionsFile = join(dir, 'tool-actions.json');
    this.approvalsFile = join(dir, 'approvals.json');
    this.skillsFile = join(dir, 'skills.json');
    this.tracesFile = join(dir, 'traces.json');
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

  async getConversation(id: string): Promise<Conversation | undefined> {
    return (await this.listConversations()).find((conversation) => conversation.id === id);
  }

  async saveConversation(conv: Conversation): Promise<Conversation[]> {
    return updateJson<Conversation[]>(this.conversationsFile, [], (current) => {
      const list = [...current];
      const idx = list.findIndex((c) => c.id === conv.id);
      if (idx >= 0) list[idx] = conv;
      else list.unshift(conv);
      return list;
    });
  }

  async deleteConversation(id: string): Promise<Conversation[]> {
    return updateJson<Conversation[]>(this.conversationsFile, [], (current) =>
      current.filter((conversation) => conversation.id !== id)
    );
  }

  listApiTraces(): Promise<ApiTrace[]> {
    return readJson<ApiTrace[]>(this.tracesFile, []);
  }

  async saveApiTrace(trace: ApiTrace): Promise<ApiTrace[]> {
    return updateJson<ApiTrace[]>(this.tracesFile, [], (current) => {
      const list = [...current];
      const idx = list.findIndex((item) => item.id === trace.id);
      if (idx >= 0) list[idx] = trace;
      else list.unshift(trace);
      return list;
    });
  }

  async clearApiTraces(): Promise<ApiTrace[]> {
    return updateJson<ApiTrace[]>(this.tracesFile, [], () => []);
  }

  async clearApiTracesScope(scope: { agentId?: string; runId?: string }): Promise<ApiTrace[]> {
    return updateJson<ApiTrace[]>(this.tracesFile, [], (current) =>
      current.filter((trace) => {
        if (scope.agentId && trace.context.agentId === scope.agentId) return false;
        if (scope.runId && (trace.id === scope.runId || trace.streamId === scope.runId)) return false;
        return true;
      })
    );
  }

  async listAgents(): Promise<AgentConfig[]> {
    await this.ensureAgentMigration();
    await this.agentMutationQueue;
    if (!this.agentsCache) {
      const stored = await readJson<PersistedAgent[]>(this.agentsFile, []);
      this.agentsCache = normalizeTeam(stored.map(toAgentShell));
    }
    return this.agentsCache.map((agent) => ({ ...agent, delegatesTo: [...agent.delegatesTo] }));
  }

  async getAgent(id: string): Promise<AgentConfig | undefined> {
    const agent = (await this.listAgents()).find((candidate) => candidate.id === id);
    if (!agent) return undefined;
    return { ...agent, soul: await this.getAgentSoul(id) };
  }

  async getAgentSoul(id: string): Promise<string> {
    const path = this.resolveSoulPath(id);
    try {
      return await fs.readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    }
  }

  async saveAgent(agent: AgentConfig): Promise<AgentConfig[]> {
    await this.ensureAgentMigration();
    return this.queueAgentMutation(async () => {
      const soulPath = this.resolveSoulPath(agent.id);
      let previousSoul: string | null = null;
      try {
        previousSoul = await fs.readFile(soulPath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      const stored = await readJson<PersistedAgent[]>(this.agentsFile, []);
      const list = normalizeTeam(stored.map(toAgentShell));
      const normalizedAgent = {
        ...agent,
        soulPath: soulPathFor(agent.id),
        capabilities: capabilityManifest(agent)
      };
      const idx = list.findIndex((candidate) => candidate.id === agent.id);
      if (idx >= 0) list[idx] = normalizedAgent;
      else list.push(normalizedAgent);
      const normalized = normalizeTeam(list);
      validateTeam(normalized);

      await atomicWriteText(soulPath, agent.soul);
      try {
        await writeJson(this.agentsFile, normalized.map(toPersistedAgent));
      } catch (error) {
        if (previousSoul === null) await fs.rm(soulPath, { force: true });
        else await atomicWriteText(soulPath, previousSoul);
        throw error;
      }
      this.agentsCache = normalized.map((candidate) => ({ ...candidate, soul: '' }));
      return this.agentsCache.map((candidate) => ({
        ...candidate,
        delegatesTo: [...candidate.delegatesTo]
      }));
    });
  }

  async deleteAgent(id: string): Promise<AgentConfig[]> {
    await this.ensureAgentMigration();
    return this.queueAgentMutation(async () => {
      const stored = await readJson<PersistedAgent[]>(this.agentsFile, []);
      const list = normalizeTeam(stored.map(toAgentShell));
      const index = list.findIndex((agent) => agent.id === id);
      if (index < 0) return list;
      list[index] = { ...list[index], archived: true, updatedAt: Date.now() };
      const normalized = normalizeTeam(list);
      validateTeam(normalized);
      await writeJson(this.agentsFile, normalized.map(toPersistedAgent));
      this.agentsCache = normalized;
      return normalized.map((candidate) => ({
        ...candidate,
        delegatesTo: [...candidate.delegatesTo]
      }));
    });
  }

  private async ensureAgentMigration(): Promise<void> {
    if (!this.agentMigration) {
      this.agentMigration = this.queueAgentMutation(async () => {
        const stored = await readJson<PersistedAgent[]>(this.agentsFile, []);
        const needsMigration = stored.some(
          (agent) =>
            Object.prototype.hasOwnProperty.call(agent, 'soul') ||
            agent.soulPath !== soulPathFor(agent.id) ||
            !agent.capabilities
        );
        if (!needsMigration) return;

        for (const agent of stored) {
          if (!Object.prototype.hasOwnProperty.call(agent, 'soul')) continue;
          const path = this.resolveSoulPath(agent.id);
          try {
            await fs.access(path);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            await atomicWriteText(path, agent.soul ?? '');
          }
        }
        const normalized = normalizeTeam(stored.map(toAgentShell));
        await writeJson(this.agentsFile, normalized.map(toPersistedAgent));
        this.agentsCache = normalized;
      });
    }
    await this.agentMigration;
  }

  private resolveSoulPath(agentId: string): string {
    if (!SAFE_AGENT_ID.test(agentId)) throw new Error('Invalid agent id.');
    const path = resolve(this.root, soulPathFor(agentId));
    const relativePath = relative(this.root, path);
    if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || relativePath.startsWith(sep)) {
      throw new Error('Agent soul path is outside the managed root.');
    }
    return path;
  }

  private queueAgentMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.agentMutationQueue.then(operation);
    this.agentMutationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  listTasks(): Promise<AgentTask[]> {
    return readJson<AgentTask[]>(this.tasksFile, []);
  }

  async getTask(id: string): Promise<AgentTask | undefined> {
    return (await this.listTasks()).find((task) => task.id === id);
  }

  async saveTask(task: AgentTask): Promise<AgentTask[]> {
    const list = await this.listTasks();
    const index = list.findIndex((item) => item.id === task.id);
    if (index >= 0) list[index] = task;
    else list.unshift(task);
    await writeJson(this.tasksFile, list);
    return list;
  }

  async deleteTask(id: string): Promise<AgentTask[]> {
    const list = (await this.listTasks()).filter((task) => task.id !== id);
    await writeJson(this.tasksFile, list);
    return list;
  }

  listSchedules(): Promise<AgentSchedule[]> {
    return readJson<AgentSchedule[]>(this.schedulesFile, []);
  }

  async getSchedule(id: string): Promise<AgentSchedule | undefined> {
    return (await this.listSchedules()).find((schedule) => schedule.id === id);
  }

  async saveSchedule(schedule: AgentSchedule): Promise<AgentSchedule[]> {
    const list = await this.listSchedules();
    const index = list.findIndex((item) => item.id === schedule.id);
    if (index >= 0) list[index] = schedule;
    else list.unshift(schedule);
    await writeJson(this.schedulesFile, list);
    return list;
  }

  async deleteSchedule(id: string): Promise<AgentSchedule[]> {
    const list = (await this.listSchedules()).filter((schedule) => schedule.id !== id);
    await writeJson(this.schedulesFile, list);
    return list;
  }

  listPipelines(): Promise<AgentPipeline[]> {
    return readJson<AgentPipeline[]>(this.pipelinesFile, []);
  }

  async getPipeline(id: string): Promise<AgentPipeline | undefined> {
    return (await this.listPipelines()).find((pipeline) => pipeline.id === id);
  }

  async savePipeline(pipeline: AgentPipeline): Promise<AgentPipeline[]> {
    const list = await this.listPipelines();
    const index = list.findIndex((item) => item.id === pipeline.id);
    if (index >= 0) list[index] = pipeline;
    else list.unshift(pipeline);
    await writeJson(this.pipelinesFile, list);
    return list;
  }

  async deletePipeline(id: string): Promise<AgentPipeline[]> {
    const list = (await this.listPipelines()).filter((pipeline) => pipeline.id !== id);
    await writeJson(this.pipelinesFile, list);
    return list;
  }

  listPipelineExecutions(): Promise<PipelineExecution[]> {
    return readJson<PipelineExecution[]>(this.pipelineExecutionsFile, []);
  }

  async getPipelineExecution(id: string): Promise<PipelineExecution | undefined> {
    return (await this.listPipelineExecutions()).find((execution) => execution.id === id);
  }

  async savePipelineExecution(execution: PipelineExecution): Promise<PipelineExecution[]> {
    const list = await this.listPipelineExecutions();
    const index = list.findIndex((item) => item.id === execution.id);
    if (index >= 0) list[index] = execution;
    else list.unshift(execution);
    await writeJson(this.pipelineExecutionsFile, list);
    return list;
  }

  listArtifacts(): Promise<RunArtifact[]> {
    return readJson<RunArtifact[]>(this.artifactsFile, []);
  }

  async saveArtifact(artifact: RunArtifact): Promise<RunArtifact[]> {
    const list = await this.listArtifacts();
    const index = list.findIndex((item) => item.id === artifact.id);
    if (index >= 0) list[index] = artifact;
    else list.unshift(artifact);
    await writeJson(this.artifactsFile, list);
    return list;
  }

  listToolActions(): Promise<ToolAction[]> {
    return readJson<ToolAction[]>(this.toolActionsFile, []);
  }

  async saveToolAction(action: ToolAction): Promise<ToolAction[]> {
    const list = await this.listToolActions();
    const index = list.findIndex((item) => item.id === action.id);
    if (index >= 0) list[index] = action;
    else list.unshift(action);
    await writeJson(this.toolActionsFile, list);
    return list;
  }

  listApprovals(): Promise<Approval[]> {
    return readJson<Approval[]>(this.approvalsFile, []);
  }

  async getApproval(id: string): Promise<Approval | undefined> {
    return (await this.listApprovals()).find((approval) => approval.id === id);
  }

  async saveApproval(approval: Approval): Promise<Approval[]> {
    const list = await this.listApprovals();
    const index = list.findIndex((item) => item.id === approval.id);
    if (index >= 0) list[index] = approval;
    else list.unshift(approval);
    await writeJson(this.approvalsFile, list);
    return list;
  }

  listSkills(): Promise<SkillDefinition[]> {
    return readJson<SkillDefinition[]>(this.skillsFile, []);
  }

  async saveSkill(skill: SkillDefinition): Promise<SkillDefinition[]> {
    const list = await this.listSkills();
    const index = list.findIndex((item) => item.id === skill.id);
    if (index >= 0) list[index] = skill;
    else list.unshift(skill);
    await writeJson(this.skillsFile, list);
    return list;
  }

  async deleteSkill(id: string): Promise<SkillDefinition[]> {
    const list = (await this.listSkills()).filter((skill) => skill.id !== id);
    await writeJson(this.skillsFile, list);
    return list;
  }

  async getSettings(): Promise<AppSettings> {
    const partial = await readJson<Partial<AppSettings>>(this.settingsFile, {});
    const storedTheme: unknown = partial.theme;
    const settings: AppSettings = {
      theme:
        storedTheme === 'neon-blue'
          ? 'graphite-blue'
          : isAppTheme(storedTheme)
            ? storedTheme
            : DEFAULT_APP_THEME,
      experimentalCopilot: partial.experimentalCopilot === true,
      activeConnectionId:
        typeof partial.activeConnectionId === 'string' ? partial.activeConnectionId : null,
      activeModel: typeof partial.activeModel === 'string' ? partial.activeModel : null,
      llmWikiPath: typeof partial.llmWikiPath === 'string' ? partial.llmWikiPath : null,
      githubClientId:
        typeof partial.githubClientId === 'string'
          ? partial.githubClientId
          : DEFAULT_SETTINGS.githubClientId
    };
    if (JSON.stringify(partial) !== JSON.stringify(settings)) {
      await writeJson(this.settingsFile, settings);
    }
    return settings;
  }

  async setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    if (patch.theme !== undefined && !isAppTheme(patch.theme)) {
      throw new Error(`Unsupported theme: ${String(patch.theme)}`);
    }
    const next = { ...(await this.getSettings()), ...patch };
    await writeJson(this.settingsFile, next);
    return next;
  }

  async queryLocalData(query: LocalDataQuery): Promise<LocalDataResult> {
    const readers: Record<LocalDataCollection, () => Promise<unknown[]>> = {
      connections: () => this.listConnections(),
      conversations: () => this.listConversations(),
      agents: () => this.listAgents(),
      tasks: () => this.listTasks(),
      schedules: () => this.listSchedules(),
      pipelines: () => this.listPipelines(),
      'pipeline-executions': () => this.listPipelineExecutions(),
      artifacts: () => this.listArtifacts(),
      'tool-actions': () => this.listToolActions(),
      approvals: () => this.listApprovals(),
      skills: () => this.listSkills(),
      traces: () => this.listApiTraces(),
      settings: async () => [await this.getSettings()]
    };
    const read = readers[query.collection];
    if (!read) throw new Error('Invalid local data collection.');

    const rows = (await read()) as Record<string, unknown>[];
    const search = query.search?.trim().toLocaleLowerCase() ?? '';
    const matchedRows = search
      ? rows.filter((row) => JSON.stringify(row).toLocaleLowerCase().includes(search))
      : rows;
    const limit = Math.max(1, Math.min(Math.trunc(query.limit ?? 100), 500));
    const resultRows = matchedRows.slice(0, limit);

    return {
      collection: query.collection,
      rows: resultRows,
      total: rows.length,
      matched: matchedRows.length,
      returned: resultRows.length,
      truncated: resultRows.length < matchedRows.length,
      source: 'json'
    };
  }
}
