// IPC channel names and streaming payload contracts shared by main + preload + renderer.

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
  conversationsList: 'conversations:list',
  conversationsSave: 'conversations:save',
  conversationsDelete: 'conversations:delete',
  agentsList: 'agents:list',
  agentsSave: 'agents:save',
  agentsDelete: 'agents:delete',
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
