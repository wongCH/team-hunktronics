import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  ChatChunkPayload,
  ChatDonePayload,
  ChatErrorPayload,
  DeviceCodePayload,
  DeviceFlowResult
} from '@shared/ipc';
import type {
  AppSettings,
  ChatRequest,
  ConnectionConfig,
  Conversation,
  ModelInfo,
  TestResult,
  VaultStatus
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
  conversations: {
    list: (): Promise<Conversation[]> => ipcRenderer.invoke(IPC.conversationsList),
    save: (conv: Conversation): Promise<Conversation[]> =>
      ipcRenderer.invoke(IPC.conversationsSave, conv),
    delete: (id: string): Promise<Conversation[]> => ipcRenderer.invoke(IPC.conversationsDelete, id)
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
