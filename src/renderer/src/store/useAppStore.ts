import { create } from 'zustand';
import type {
  AppSettings,
  ConnectionConfig,
  ModelInfo,
  TestResult,
  VaultStatus
} from '@shared/types';
import { PROVIDER_META } from '@shared/types';
import { api } from '@/lib/api';

export type Page = 'dashboard' | 'agents' | 'tasks' | 'chat' | 'memory' | 'operations' | 'data' | 'settings';

interface AppState {
  ready: boolean;
  vault: VaultStatus | null;
  connections: ConnectionConfig[];
  settings: AppSettings | null;
  models: ModelInfo[];
  modelsLoading: boolean;
  modelsError: string | null;
  page: Page;

  loadAll: () => Promise<void>;
  refreshConnections: () => Promise<void>;
  saveConnection: (conn: ConnectionConfig) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  setSecret: (id: string, secret: string) => Promise<void>;
  clearSecret: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<TestResult>;
  loadModels: (id: string) => Promise<void>;
  setActiveConnection: (id: string | null) => Promise<void>;
  setActiveModel: (model: string | null) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setPage: (page: Page) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  vault: null,
  connections: [],
  settings: null,
  models: [],
  modelsLoading: false,
  modelsError: null,
  page: 'dashboard',

  loadAll: async () => {
    const [vault, connections, settings] = await Promise.all([
      api.vault.status(),
      api.connections.list(),
      api.settings.get()
    ]);
    set({ vault, connections, settings, ready: true });
    if (settings.activeConnectionId) {
      await get().loadModels(settings.activeConnectionId);
    }
  },

  refreshConnections: async () => {
    set({ connections: await api.connections.list() });
  },

  saveConnection: async (conn) => {
    const connections = await api.connections.upsert(conn);
    set({ connections });
  },

  deleteConnection: async (id) => {
    const connections = await api.connections.remove(id);
    const { settings } = get();
    const patch: Partial<AppSettings> = {};
    if (settings?.activeConnectionId === id) {
      patch.activeConnectionId = null;
      patch.activeModel = null;
    }
    set({ connections, models: [] });
    if (Object.keys(patch).length) await get().updateSettings(patch);
  },

  setSecret: async (id, secret) => {
    await api.secrets.set(id, secret);
    await get().refreshConnections();
  },

  clearSecret: async (id) => {
    await api.secrets.clear(id);
    await get().refreshConnections();
  },

  testConnection: (id) => api.connections.test(id),

  loadModels: async (id) => {
    set({ modelsLoading: true, modelsError: null, models: [] });
    try {
      const models = await api.models.list(id);
      set({ models, modelsLoading: false });
    } catch (err) {
      const conn = get().connections.find((c) => c.id === id);
      const suggested = conn ? (PROVIDER_META[conn.providerType].suggestedModels ?? []) : [];
      set({
        models: suggested.map((m) => ({ id: m })),
        modelsLoading: false,
        modelsError: (err as Error).message
      });
    }
  },

  setActiveConnection: async (id) => {
    await get().updateSettings({ activeConnectionId: id, activeModel: null });
    if (id) {
      await get().loadModels(id);
      const conn = get().connections.find((c) => c.id === id);
      const models = get().models;
      const next = conn?.defaultModel ?? models[0]?.id ?? null;
      if (next) await get().setActiveModel(next);
    } else {
      set({ models: [] });
    }
  },

  setActiveModel: async (model) => {
    await get().updateSettings({ activeModel: model });
  },

  updateSettings: async (patch) => {
    const settings = await api.settings.set(patch);
    set({ settings });
  },

  setPage: (page) => set({ page })
}));
