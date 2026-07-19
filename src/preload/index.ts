import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  ChatChunkPayload,
  ChatDonePayload,
  ChatErrorPayload,
  DeviceCodePayload,
  DeviceFlowResult,
  RunEventPayload,
  TraceUpdatePayload
} from '@shared/ipc';
import type {
  AgentTask,
  Approval,
  AgentSchedule,
  AgentPipeline,
  ApiTrace,
  AppSettings,
  ChatRequest,
  ConnectionConfig,
  Conversation,
  LocalDataQuery,
  LocalDataResult,
  MemoryDocument,
  MemoryCompressionProposal,
  MemoryHealth,
  MemorySearchResult,
  MemoryWriteCommand,
  ModelInfo,
  RunView,
  PipelineExecution,
  RunArtifact,
  ToolAction,
  ToolActionRequest,
  StartRunCommand,
  TestResult,
  VaultStatus,
  AgentConfig
} from '@shared/types';

type Unsubscribe = () => void;

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: unknown, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener as never);
  return () => ipcRenderer.removeListener(channel, listener as never);
}

const api = {
  vault: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke(IPC.vaultStatus)
  },
  connections: {
    list: (): Promise<ConnectionConfig[]> => ipcRenderer.invoke(IPC.connectionsList),
    upsert: (conn: ConnectionConfig): Promise<ConnectionConfig[]> =>
      ipcRenderer.invoke(IPC.connectionsUpsert, conn),
    remove: (id: string): Promise<ConnectionConfig[]> =>
      ipcRenderer.invoke(IPC.connectionsRemove, id),
    test: (id: string): Promise<TestResult> => ipcRenderer.invoke(IPC.connectionsTest, id)
  },
  secrets: {
    set: (id: string, secret: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.secretsSet, id, secret),
    clear: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.secretsClear, id),
    has: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.secretsHas, id)
  },
  models: {
    list: (id: string): Promise<ModelInfo[]> => ipcRenderer.invoke(IPC.modelsList, id)
  },
  chat: {
    send: (req: ChatRequest): Promise<{ streamId: string }> =>
      ipcRenderer.invoke(IPC.chatSend, req),
    cancel: (streamId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.chatCancel, streamId),
    onChunk: (cb: (p: ChatChunkPayload) => void): Unsubscribe => subscribe(IPC.chatChunk, cb),
    onDone: (cb: (p: ChatDonePayload) => void): Unsubscribe => subscribe(IPC.chatDone, cb),
    onError: (cb: (p: ChatErrorPayload) => void): Unsubscribe => subscribe(IPC.chatError, cb)
  },
  runs: {
    start: (command: StartRunCommand): Promise<RunView> =>
      ipcRenderer.invoke(IPC.runsStart, command),
    cancel: (runId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.runsCancel, runId),
    onEvent: (cb: (event: RunEventPayload) => void): Unsubscribe =>
      subscribe(IPC.runEvent, cb)
  },
  traces: {
    list: (): Promise<ApiTrace[]> => ipcRenderer.invoke(IPC.tracesList),
    clear: (): Promise<ApiTrace[]> => ipcRenderer.invoke(IPC.tracesClear),
    clearScope: (scope: { agentId?: string; runId?: string }): Promise<ApiTrace[]> =>
      ipcRenderer.invoke(IPC.tracesClearScope, scope),
    onUpdate: (cb: (p: TraceUpdatePayload) => void): Unsubscribe => subscribe(IPC.traceUpdate, cb)
  },
  conversations: {
    list: (): Promise<Conversation[]> => ipcRenderer.invoke(IPC.conversationsList),
    save: (conv: Conversation): Promise<Conversation[]> =>
      ipcRenderer.invoke(IPC.conversationsSave, conv),
    delete: (id: string): Promise<Conversation[]> => ipcRenderer.invoke(IPC.conversationsDelete, id)
  },
  agents: {
    list: (): Promise<AgentConfig[]> => ipcRenderer.invoke(IPC.agentsList),
    save: (agent: AgentConfig): Promise<AgentConfig[]> => ipcRenderer.invoke(IPC.agentsSave, agent),
    delete: (id: string): Promise<AgentConfig[]> => ipcRenderer.invoke(IPC.agentsDelete, id)
  },
  memory: {
    list: (): Promise<MemoryDocument[]> => ipcRenderer.invoke(IPC.memoryList),
    write: (command: MemoryWriteCommand): Promise<MemoryDocument> =>
      ipcRenderer.invoke(IPC.memoryWrite, command),
    search: (query: string, limit?: number): Promise<MemorySearchResult[]> =>
      ipcRenderer.invoke(IPC.memorySearch, query, limit),
    health: (): Promise<MemoryHealth> => ipcRenderer.invoke(IPC.memoryHealth),
    proposeCompression: (agentId: string): Promise<MemoryCompressionProposal> =>
      ipcRenderer.invoke(IPC.memoryCompressPropose, agentId),
    applyCompression: (proposalId: string): Promise<MemoryDocument> =>
      ipcRenderer.invoke(IPC.memoryCompressApply, proposalId)
  },
  tasks: {
    list: (): Promise<AgentTask[]> => ipcRenderer.invoke(IPC.tasksList),
    save: (task: AgentTask): Promise<AgentTask[]> => ipcRenderer.invoke(IPC.tasksSave, task),
    delete: (id: string): Promise<AgentTask[]> => ipcRenderer.invoke(IPC.tasksDelete, id),
    start: (id: string): Promise<{ task: AgentTask; run: RunView }> =>
      ipcRenderer.invoke(IPC.tasksStart, id)
  },
  schedules: {
    list: (): Promise<AgentSchedule[]> => ipcRenderer.invoke(IPC.schedulesList),
    save: (schedule: AgentSchedule): Promise<AgentSchedule[]> =>
      ipcRenderer.invoke(IPC.schedulesSave, schedule),
    delete: (id: string): Promise<AgentSchedule[]> => ipcRenderer.invoke(IPC.schedulesDelete, id),
    runNow: (id: string): Promise<RunView> => ipcRenderer.invoke(IPC.schedulesRunNow, id)
  },
  pipelines: {
    list: (): Promise<AgentPipeline[]> => ipcRenderer.invoke(IPC.pipelinesList),
    save: (pipeline: AgentPipeline): Promise<AgentPipeline[]> =>
      ipcRenderer.invoke(IPC.pipelinesSave, pipeline),
    delete: (id: string): Promise<AgentPipeline[]> => ipcRenderer.invoke(IPC.pipelinesDelete, id),
    start: (id: string, goal: string): Promise<PipelineExecution> =>
      ipcRenderer.invoke(IPC.pipelinesStart, id, goal),
    executions: (): Promise<PipelineExecution[]> => ipcRenderer.invoke(IPC.pipelineExecutionsList),
    artifacts: (): Promise<RunArtifact[]> => ipcRenderer.invoke(IPC.artifactsList)
  },
  toolPolicy: {
    actions: (): Promise<ToolAction[]> => ipcRenderer.invoke(IPC.toolActionsList),
    authorize: (
      request: ToolActionRequest
    ): Promise<{ action: ToolAction; approval?: Approval }> =>
      ipcRenderer.invoke(IPC.toolActionsAuthorize, request),
    approvals: (): Promise<Approval[]> => ipcRenderer.invoke(IPC.approvalsList),
    decide: (approvalId: string, approved: boolean): Promise<Approval> =>
      ipcRenderer.invoke(IPC.approvalsDecide, approvalId, approved)
  },
  localData: {
    query: (query: LocalDataQuery): Promise<LocalDataResult> =>
      ipcRenderer.invoke(IPC.localDataQuery, query)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  github: {
    startDeviceFlow: (connectionId: string, scope?: string): Promise<DeviceFlowResult> =>
      ipcRenderer.invoke(IPC.githubStartDeviceFlow, connectionId, scope),
    cancelDeviceFlow: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.githubCancelDeviceFlow),
    onDeviceCode: (cb: (p: DeviceCodePayload) => void): Unsubscribe =>
      subscribe(IPC.githubDeviceCode, cb)
  },
  shell: {
    openExternal: (url: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.openExternal, url)
  }
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
