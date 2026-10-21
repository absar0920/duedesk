import type { TaskFilter, TaskSort, WidgetConfig } from './types'

export const SCHEMA_VERSION = 1
export const DATA_FILE_NAME = 'duedesk-data.json'

export const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'none', label: 'No due date' }
]

export const SORTS: { id: TaskSort; label: string }[] = [
  { id: 'due', label: 'Due date' },
  { id: 'created', label: 'Created' },
  { id: 'name', label: 'Name' }
]

export const FILTER_IDS = FILTERS.map((f) => f.id)
export const SORT_IDS = SORTS.map((s) => s.id)

export function filterLabel(filter: TaskFilter): string {
  return FILTERS.find((f) => f.id === filter)?.label ?? 'All'
}

export const WIDGET_MIN_WIDTH = 220
export const WIDGET_MIN_HEIGHT = 140

export const WIDGET_DEFAULTS: Omit<WidgetConfig, 'id' | 'x' | 'y'> = {
  width: 340,
  height: 400,
  filter: 'all',
  sort: 'due',
  showCompleted: false,
  locked: false,
  opacity: 0.55,
  alwaysOnTop: false
}
