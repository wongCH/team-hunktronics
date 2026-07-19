// IPC channel names and streaming payload contracts shared by main + preload + renderer.
import type { ApiTrace, RunEvent } from './types';

export const IPC = {
  vaultStatus: 'vault:status',
  connectionsList: 'connections:list',
  connectionsUpsert: 'connections:upsert',
  connectionsRemove: 'connections:remove',
  connectionsTest: 'connections:test',
  secretsSet: 'secrets:set',
  secretsClear: 'secrets:clear',
  secretsHas: 'secrets:has',
  modelsList: 'models:list',
  chatSend: 'chat:send',
  chatCancel: 'chat:cancel',
  chatChunk: 'chat:chunk',
  chatDone: 'chat:done',
  chatError: 'chat:error',
  runsStart: 'runs:start',
  runsCancel: 'runs:cancel',
  runEvent: 'runs:event',
  tracesList: 'traces:list',
  tracesClear: 'traces:clear',
  tracesClearScope: 'traces:clearScope',
  traceUpdate: 'traces:update',
  conversationsList: 'conversations:list',
  conversationsSave: 'conversations:save',
  conversationsDelete: 'conversations:delete',
  agentsList: 'agents:list',
  agentsSave: 'agents:save',
  agentsDelete: 'agents:delete',
  memoryList: 'memory:list',
  memoryWrite: 'memory:write',
  memorySearch: 'memory:search',
  memoryHealth: 'memory:health',
  memoryCompressPropose: 'memory:compressPropose',
  memoryCompressApply: 'memory:compressApply',
  tasksList: 'tasks:list',
  tasksSave: 'tasks:save',
  tasksDelete: 'tasks:delete',
  tasksStart: 'tasks:start',
  schedulesList: 'schedules:list',
  schedulesSave: 'schedules:save',
  schedulesDelete: 'schedules:delete',
  schedulesRunNow: 'schedules:runNow',
  pipelinesList: 'pipelines:list',
  pipelinesSave: 'pipelines:save',
  pipelinesDelete: 'pipelines:delete',
  pipelinesStart: 'pipelines:start',
  pipelineExecutionsList: 'pipelineExecutions:list',
  artifactsList: 'artifacts:list',
  toolActionsList: 'toolActions:list',
  toolActionsAuthorize: 'toolActions:authorize',
  approvalsList: 'approvals:list',
  approvalsDecide: 'approvals:decide',
  localDataQuery: 'localData:query',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  githubStartDeviceFlow: 'github:startDeviceFlow',
  githubDeviceCode: 'github:deviceCode',
  githubCancelDeviceFlow: 'github:cancelDeviceFlow',
  openExternal: 'shell:openExternal'
} as const;

export interface ChatChunkPayload {
  streamId: string;
  delta: string;
}

export interface ChatDonePayload {
  streamId: string;
}

export interface ChatErrorPayload {
  streamId: string;
  message: string;
}

export interface TraceUpdatePayload {
  trace: ApiTrace;
}

export type RunEventPayload = RunEvent;

export interface DeviceCodePayload {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

export interface DeviceFlowResult {
  ok: boolean;
  message: string;
  /** Whether a token was stored for the given connection. */
  stored: boolean;
}
