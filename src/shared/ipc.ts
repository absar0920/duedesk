import type { Bounds, Settings, Task, TaskInput, TaskPatch, WidgetConfig, WidgetPatch } from './types'

export const IPC = {
  tasksList: 'tasks:list',
  tasksCreate: 'tasks:create',
  tasksUpdate: 'tasks:update',
  tasksToggle: 'tasks:toggle',
  tasksDelete: 'tasks:delete',
  tasksConfirmDelete: 'tasks:confirm-delete',
  settingsGet: 'settings:get',
  settingsSetLaunch: 'settings:set-launch',
  widgetsAdd: 'widgets:add',
  widgetsUpdate: 'widgets:update',
  widgetsRemove: 'widgets:remove',
  widgetsSetBounds: 'widgets:set-bounds',
  widgetsVisibility: 'widgets:visibility',
  widgetsSetVisible: 'widgets:set-visible',
  appOpenTask: 'app:open-task',
  appNewTask: 'app:new-task',
  appShowMain: 'app:show-main',
  winMinimize: 'win:minimize',
  winToggleMaximize: 'win:toggle-maximize',
  winClose: 'win:close',
  winIsMaximized: 'win:is-maximized',
  // main -> renderer events
  evTasks: 'ev:tasks',
  evSettings: 'ev:settings',
  evEditTask: 'ev:edit-task',
  evNewTask: 'ev:new-task',
  evMaximized: 'ev:maximized',
  evWidgetsVisible: 'ev:widgets-visible'
} as const

export type Unsubscribe = () => void

export interface DueDeskApi {
  tasks: {
    list(): Promise<Task[]>
    create(input: TaskInput): Promise<Task>
    update(id: string, patch: TaskPatch): Promise<Task>
    toggle(id: string): Promise<Task>
    remove(id: string): Promise<boolean>
    /** Shows a native confirmation dialog, deletes when confirmed. Returns true if deleted. */
    confirmRemove(id: string): Promise<boolean>
  }
  settings: {
    get(): Promise<Settings>
    setLaunchAtStartup(value: boolean): Promise<Settings>
  }
  widgets: {
    add(): Promise<WidgetConfig>
    update(id: string, patch: WidgetPatch): Promise<WidgetConfig>
    remove(id: string): Promise<boolean>
    setBounds(id: string, bounds: Bounds): void
    isVisible(): Promise<boolean>
    setVisible(visible: boolean): Promise<boolean>
  }
  app: {
    openTask(id: string): void
    newTask(): void
    showMain(): void
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
  }
  on: {
    tasks(cb: (tasks: Task[]) => void): Unsubscribe
    settings(cb: (settings: Settings) => void): Unsubscribe
    editTask(cb: (id: string) => void): Unsubscribe
    newTask(cb: () => void): Unsubscribe
    maximized(cb: (maximized: boolean) => void): Unsubscribe
    widgetsVisible(cb: (visible: boolean) => void): Unsubscribe
  }
}
