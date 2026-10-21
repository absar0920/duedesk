import { describe, expect, it } from 'vitest'
import { countByFilter, groupOf, listTasks, matchesFilter, sortTasks } from '../src/shared/tasks'
import type { Task } from '../src/shared/types'

const NOW = new Date(2026, 9, 21, 10, 30) // Wed Oct 21 2026 10:30

let seq = 0
function task(name: string, dueAt: string | null, extra: Partial<Task> = {}): Task {
  seq++
  const created = new Date(2026, 9, 1, 0, seq).toISOString()
  return {
    id: `t${seq}`,
    name,
    description: '',
    dueAt,
    completed: false,
    completedAt: null,
    createdAt: created,
    updatedAt: created,
    ...extra
  }
}

const overdueOld = task('overdue old', '2026-10-18')
const overdueToday = task('overdue today', '2026-10-21T09:00')
const todayLater = task('today later', '2026-10-21T17:00')
const todayDateOnly = task('today date-only', '2026-10-21')
const tomorrow = task('tomorrow', '2026-10-22')
const nextWeek = task('next week edge', '2026-10-28')
const later = task('later', '2026-12-01')
const noDue = task('no due', null)
const done = task('done', '2026-10-20', { completed: true, completedAt: new Date(2026, 9, 20).toISOString() })
const ALL = [later, noDue, done, tomorrow, todayDateOnly, overdueToday, nextWeek, todayLater, overdueOld]

const names = (ts: Task[]): string[] => ts.map((t) => t.name)

describe('matchesFilter', () => {
  it('overdue excludes completed tasks', () => {
    expect(ALL.filter((t) => matchesFilter(t, 'overdue', NOW)).map((t) => t.name).sort()).toEqual(
      ['overdue old', 'overdue today'].sort()
    )
  })
  it('today = due date is today (including timed ones already past)', () => {
    expect(names(ALL.filter((t) => matchesFilter(t, 'today', NOW))).sort()).toEqual(
      ['overdue today', 'today later', 'today date-only'].sort()
    )
  })
  it('next 7 days includes today through +7 days', () => {
    expect(names(ALL.filter((t) => matchesFilter(t, 'week', NOW))).sort()).toEqual(
      ['overdue today', 'today later', 'today date-only', 'tomorrow', 'next week edge'].sort()
    )
  })
  it('none = no due date', () => {
    expect(names(ALL.filter((t) => matchesFilter(t, 'none', NOW)))).toEqual(['no due'])
  })
})

describe('sortTasks', () => {
  it('due: most urgent first, no-due after dated, completed last', () => {
    expect(names(sortTasks(ALL, 'due'))).toEqual([
      'overdue old',
      'overdue today',
      'today later',
      'today date-only',
      'tomorrow',
      'next week edge',
      'later',
      'no due',
      'done'
    ])
  })
  it('created: newest first, completed last', () => {
    const sorted = names(sortTasks(ALL, 'created'))
    expect(sorted[0]).toBe('no due')
    expect(sorted.at(-1)).toBe('done')
  })
  it('name: case-insensitive natural order', () => {
    const ts = [task('b task', null), task('Task 10', null), task('a Task', null), task('task 2', null)]
    expect(names(sortTasks(ts, 'name'))).toEqual(['a Task', 'b task', 'task 2', 'Task 10'])
  })
  it('does not mutate the input', () => {
    const copy = [...ALL]
    sortTasks(ALL, 'name')
    expect(ALL).toEqual(copy)
  })
})

describe('listTasks', () => {
  it('hides completed unless showCompleted', () => {
    expect(names(listTasks(ALL, { filter: 'all', sort: 'due', showCompleted: false }, NOW))).not.toContain('done')
    expect(names(listTasks(ALL, { filter: 'all', sort: 'due', showCompleted: true }, NOW))).toContain('done')
  })
  it('applies filter, search and sort together', () => {
    const r = listTasks(ALL, { filter: 'week', sort: 'due', showCompleted: false, search: 'TODAY' }, NOW)
    expect(names(r)).toEqual(['overdue today', 'today later', 'today date-only'])
  })
  it('search matches descriptions', () => {
    const t = task('plain', null, { description: 'Buy milk' })
    expect(listTasks([t], { filter: 'all', sort: 'due', showCompleted: false, search: 'milk' }, NOW)).toHaveLength(1)
  })
})

describe('countByFilter / groupOf', () => {
  it('counts only active tasks', () => {
    expect(countByFilter(ALL, NOW)).toEqual({ all: 8, overdue: 2, today: 3, week: 5, none: 1 })
  })
  it('groups', () => {
    expect(groupOf(done, NOW)).toBe('completed')
    expect(groupOf(overdueOld, NOW)).toBe('overdue')
    expect(groupOf(later, NOW)).toBe('later')
  })
})
