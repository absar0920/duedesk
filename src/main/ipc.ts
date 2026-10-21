import { BrowserWindow, dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type { Bounds, TaskInput, TaskPatch, WidgetPatch } from '../shared/types'
import type { Store } from './store'
import type { WindowManager } from './windows'

export interface IpcDeps {
  store: Store
  windows: WindowManager
  setLaunchAtStartup(value: boolean): void
}

const asId = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new Error('Invalid id')
  return v
}
const asObj = <T>(v: unknown): T => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('Invalid payload')
  return v as T
}

function pick<T extends object>(src: Record<string, unknown>, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {}
  for (const k of keys) if (k in src) (out as Record<string, unknown>)[k as string] = src[k as string]
  return out
}

export function registerIpc({ store, windows, setLaunchAtStartup }: IpcDeps): void {
  const handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, fn)
  }
  const on = (channel: string, fn: (e: IpcMainEvent, ...args: unknown[]) => void): void => {
    ipcMain.on(channel, fn)
  }

  // ---- tasks
  handle(IPC.tasksList, () => store.getTasks())
  handle(IPC.tasksCreate, (_e, input) => {
    const i = asObj<Record<string, unknown>>(input)
    return store.createTask(pick<TaskInput>(i, ['name', 'description', 'dueAt']) as TaskInput)
  })
  handle(IPC.tasksUpdate, (_e, id, patch) =>
    store.updateTask(asId(id), pick<TaskPatch>(asObj(patch), ['name', 'description', 'dueAt', 'completed']))
  )
  handle(IPC.tasksToggle, (_e, id) => store.toggleTask(asId(id)))
  handle(IPC.tasksDelete, (_e, id) => store.deleteTask(asId(id)))
  handle(IPC.tasksConfirmDelete, async (e, id) => {
    const task = store.getTask(asId(id))
    if (!task) return false
    const parent = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      type: 'question' as const,
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Delete task',
      message: `Delete "${task.name}"?`,
      detail: 'This cannot be undone.',
      noLink: true
    }
    const { response } = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts)
    return response === 0 ? store.deleteTask(task.id) : false
  })

  // ---- settings
  handle(IPC.settingsGet, () => store.getSettings())
  handle(IPC.settingsSetLaunch, (_e, value) => {
    setLaunchAtStartup(Boolean(value))
    return store.getSettings()
  })

  // ---- widgets
  handle(IPC.widgetsAdd, () => windows.addWidget())
  handle(IPC.widgetsUpdate, (_e, id, patch) =>
    store.updateWidget(
      asId(id),
      pick<WidgetPatch>(asObj(patch), ['filter', 'sort', 'showCompleted', 'locked', 'opacity', 'alwaysOnTop'])
    )
  )
  handle(IPC.widgetsRemove, (_e, id) => windows.removeWidget(asId(id)))
  handle(IPC.widgetsVisibility, () => windows.areWidgetsVisible())
  handle(IPC.widgetsSetVisible, (_e, visible) => {
    windows.setWidgetsVisible(Boolean(visible))
    return windows.areWidgetsVisible()
  })
  on(IPC.widgetsSetBounds, (_e, id, bounds) => {
    try {
      windows.setWidgetBounds(asId(id), asObj<Bounds>(bounds))
    } catch {
      /* ignore malformed request */
    }
  })

  // ---- app
  on(IPC.appOpenTask, (_e, id) => {
    if (typeof id === 'string' && store.getTask(id)) windows.openTask(id)
  })
  on(IPC.appNewTask, () => windows.newTask())
  on(IPC.appShowMain, () => windows.showMain())

  // ---- window controls (main window, custom title bar)
  const senderWin = (e: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null => BrowserWindow.fromWebContents(e.sender)
  on(IPC.winMinimize, (e) => senderWin(e)?.minimize())
  on(IPC.winToggleMaximize, (e) => {
    const w = senderWin(e)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  on(IPC.winClose, (e) => senderWin(e)?.close())
  handle(IPC.winIsMaximized, (e) => senderWin(e)?.isMaximized() ?? false)
}
