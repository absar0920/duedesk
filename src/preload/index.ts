import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type DueDeskApi } from '../shared/ipc'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: DueDeskApi = {
  tasks: {
    list: () => ipcRenderer.invoke(IPC.tasksList),
    create: (input) => ipcRenderer.invoke(IPC.tasksCreate, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.tasksUpdate, id, patch),
    toggle: (id) => ipcRenderer.invoke(IPC.tasksToggle, id),
    remove: (id) => ipcRenderer.invoke(IPC.tasksDelete, id),
    confirmRemove: (id) => ipcRenderer.invoke(IPC.tasksConfirmDelete, id)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    setLaunchAtStartup: (value) => ipcRenderer.invoke(IPC.settingsSetLaunch, value)
  },
  widgets: {
    add: () => ipcRenderer.invoke(IPC.widgetsAdd),
    update: (id, patch) => ipcRenderer.invoke(IPC.widgetsUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(IPC.widgetsRemove, id),
    setBounds: (id, bounds) => ipcRenderer.send(IPC.widgetsSetBounds, id, bounds),
    isVisible: () => ipcRenderer.invoke(IPC.widgetsVisibility),
    setVisible: (visible) => ipcRenderer.invoke(IPC.widgetsSetVisible, visible)
  },
  app: {
    openTask: (id) => ipcRenderer.send(IPC.appOpenTask, id),
    newTask: () => ipcRenderer.send(IPC.appNewTask),
    showMain: () => ipcRenderer.send(IPC.appShowMain)
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.winMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.winToggleMaximize),
    close: () => ipcRenderer.send(IPC.winClose),
    isMaximized: () => ipcRenderer.invoke(IPC.winIsMaximized)
  },
  on: {
    tasks: (cb) => subscribe(IPC.evTasks, cb),
    settings: (cb) => subscribe(IPC.evSettings, cb),
    editTask: (cb) => subscribe(IPC.evEditTask, cb),
    newTask: (cb) => subscribe(IPC.evNewTask, cb),
    maximized: (cb) => subscribe(IPC.evMaximized, cb),
    widgetsVisible: (cb) => subscribe(IPC.evWidgetsVisible, cb)
  }
}

contextBridge.exposeInMainWorld('duedesk', api)
