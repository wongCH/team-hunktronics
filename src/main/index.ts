import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { Store } from './store';
import { Vault } from './vault';
import { registerIpc, registerPipelineIpc, registerScheduleIpc } from './ipc';
import { MemoryService } from './memoryService';
import { ScheduleService } from './scheduleService';
import { PipelineService } from './pipelineService';
import { LlmWikiService } from './llmWikiService';

app.setName('Agent Control Panel');

let mainWindow: BrowserWindow | null = null;
let scheduleService: ScheduleService | null = null;
let memoryMaintenanceTimer: ReturnType<typeof setInterval> | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  // Security: block in-app navigation and route external links to the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl && url.startsWith(devUrl)) return;
    event.preventDefault();
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  const userDataDir = app.getPath('userData');
  const store = new Store(userDataDir);
  const vault = new Vault(userDataDir);
  const memory = new MemoryService(userDataDir);
  const llmWiki = new LlmWikiService();
  const { runService } = registerIpc({
    getWindow: () => mainWindow,
    store,
    vault,
    memory,
    llmWiki
  });
  scheduleService = new ScheduleService({
    listSchedules: () => store.listSchedules(),
    saveSchedule: (schedule) => store.saveSchedule(schedule),
    getAgent: (id) => store.getAgent(id),
    getConversation: (id) => store.getConversation(id),
    saveConversation: (conversation) => store.saveConversation(conversation),
    startRun: (command) => runService.start(command)
  });
  const pipelineService = new PipelineService({
    getPipeline: (id) => store.getPipeline(id),
    listExecutions: () => store.listPipelineExecutions(),
    getExecution: (id) => store.getPipelineExecution(id),
    saveExecution: (execution) => store.savePipelineExecution(execution),
    listArtifacts: () => store.listArtifacts(),
    saveArtifact: (artifact) => store.saveArtifact(artifact),
    listAgents: () => store.listAgents(),
    saveConversation: (conversation) => store.saveConversation(conversation),
    getConversation: (id) => store.getConversation(id),
    startRun: (command) => runService.start(command)
  });
  runService.subscribe((event) => {
    void scheduleService
      ?.handleRunEvent(event)
      .catch((error) => console.error('Schedule event handling failed.', error));
    void pipelineService
      .handleRunEvent(event)
      .catch((error) => console.error('Pipeline event handling failed.', error));
    if (
      event.type === 'state' &&
      event.run.agentId &&
      ['completed', 'failed', 'cancelled'].includes(event.run.status)
    ) {
      void memory
        .appendDailyLog(
          event.run.agentId,
          `## ${new Date(event.run.updatedAt).toISOString()} · Agent run\n- Run: ${event.run.id}\n- Conversation: ${event.run.conversationId}\n- Status: ${event.run.status}\n- Outcome: ${event.run.outputSummary || 'No output was produced.'}\n- Artifacts: ${event.run.artifactRefs?.join(', ') || 'None'}\n- Error: ${event.run.error ?? 'None'}`,
          event.run.updatedAt
        )
        .catch((error) => console.error('Could not append agent memory log.', error));
    }
  });
  registerScheduleIpc(store, scheduleService);
  registerPipelineIpc(store, pipelineService);
  scheduleService.start();
  void memory.maintain().catch((error) => console.error('Memory maintenance failed.', error));
  memoryMaintenanceTimer = setInterval(
    () =>
      void memory.maintain().catch((error) => console.error('Memory maintenance failed.', error)),
    86_400_000
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  scheduleService?.stop();
  if (memoryMaintenanceTimer) clearInterval(memoryMaintenanceTimer);
  memoryMaintenanceTimer = null;
});
