/**
 * Due date encoding: a LOCAL ISO-8601 date or date-time with no time zone (deliberately not a
 * UTC timestamp, so date-only dues stay on their calendar day):
 *  - "YYYY-MM-DD"        date only, counts as the END of that day
 *  - "YYYY-MM-DDTHH:mm"  date with a specific time
 * Zoned ISO timestamps are accepted on input and converted to local time by normalizeDue().
 */
export type DueString = string

export interface Task {
  id: string
  name: string
  description: string
  dueAt: DueString | null
  completed: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type TaskFilter = 'all' | 'overdue' | 'today' | 'week' | 'none'
export type TaskSort = 'due' | 'created' | 'name'

export interface WidgetConfig {
  id: string
  x: number
  y: number
  width: number
  height: number
  filter: TaskFilter
  sort: TaskSort
  showCompleted: boolean
  locked: boolean
  /** Background alpha, 0.1 – 1 */
  opacity: number
  alwaysOnTop: boolean
}

export interface Settings {
  launchAtStartup: boolean
  widgets: WidgetConfig[]
}

export interface StoreData {
  version: number
  tasks: Task[]
  settings: Settings
  /** Keys "<taskId>|<dueAt>" for which a due notification was already shown. */
  notified: string[]
}

export interface TaskInput {
  name: string
  description?: string
  dueAt?: DueString | null
}

export type TaskPatch = Partial<Pick<Task, 'name' | 'description' | 'dueAt' | 'completed'>>

export type WidgetPatch = Partial<Omit<WidgetConfig, 'id'>>

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
