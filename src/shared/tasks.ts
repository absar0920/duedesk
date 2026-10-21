import { classifyDue, dayDiff, dueDeadline, type DueClass } from './dates'
import type { Task, TaskFilter, TaskSort } from './types'

export interface ListOptions {
  filter: TaskFilter
  sort: TaskSort
  showCompleted: boolean
  search?: string
}

export function matchesFilter(task: Task, filter: TaskFilter, now: Date): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'overdue':
      return !task.completed && classifyDue(task.dueAt, now) === 'overdue'
    case 'today':
      return dayDiff(task.dueAt, now) === 0
    case 'week': {
      const d = dayDiff(task.dueAt, now)
      return d !== null && d >= 0 && d <= 7
    }
    case 'none':
      return task.dueAt === null || dueDeadline(task.dueAt) === null
  }
}

export function matchesSearch(task: Task, search: string | undefined): boolean {
  const q = (search ?? '').trim().toLowerCase()
  if (!q) return true
  return task.name.toLowerCase().includes(q) || task.description.toLowerCase().includes(q)
}

const time = (iso: string | null): number => (iso ? Date.parse(iso) || 0 : 0)

/** Active tasks first; completed tasks always at the bottom, most recently completed first. */
function completedLast(a: Task, b: Task): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  if (a.completed && b.completed) return time(b.completedAt) - time(a.completedAt)
  return 0
}

export function compareByDue(a: Task, b: Task): number {
  const da = dueDeadline(a.dueAt)
  const db = dueDeadline(b.dueAt)
  if (da && db) {
    const diff = da.getTime() - db.getTime()
    if (diff !== 0) return diff
  } else if (da || db) {
    return da ? -1 : 1 // tasks without a due date go last
  }
  return time(a.createdAt) - time(b.createdAt)
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  const cmp = (a: Task, b: Task): number => {
    const c = completedLast(a, b)
    if (c !== 0 || (a.completed && b.completed)) return c
    switch (sort) {
      case 'due':
        return compareByDue(a, b)
      case 'created':
        return time(b.createdAt) - time(a.createdAt) || a.id.localeCompare(b.id)
      case 'name':
        return collator.compare(a.name, b.name) || compareByDue(a, b)
    }
  }
  return [...tasks].sort(cmp)
}

export function listTasks(tasks: Task[], opts: ListOptions, now: Date): Task[] {
  const visible = tasks.filter(
    (t) => (opts.showCompleted || !t.completed) && matchesFilter(t, opts.filter, now) && matchesSearch(t, opts.search)
  )
  return sortTasks(visible, opts.sort)
}

/** Count of active (not completed) tasks per filter, for chip badges. */
export function countByFilter(tasks: Task[], now: Date): Record<TaskFilter, number> {
  const out: Record<TaskFilter, number> = { all: 0, overdue: 0, today: 0, week: 0, none: 0 }
  for (const t of tasks) {
    if (t.completed) continue
    for (const f of Object.keys(out) as TaskFilter[]) if (matchesFilter(t, f, now)) out[f]++
  }
  return out
}

export type TaskGroup = DueClass | 'completed'

export function groupOf(task: Task, now: Date): TaskGroup {
  return task.completed ? 'completed' : classifyDue(task.dueAt, now)
}

export const GROUP_LABELS: Record<TaskGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'Next 7 days',
  later: 'Later',
  none: 'No due date',
  completed: 'Completed'
}
