import { describe, expect, it } from 'vitest'
import { notificationKey, planDueNotifications } from '../src/shared/notify'
import type { Task } from '../src/shared/types'

const NOW = new Date(2026, 9, 21, 10, 30)
const mk = (id: string, dueAt: string | null, completed = false): Task => ({
  id,
  name: id,
  description: '',
  dueAt,
  completed,
  completedAt: completed ? NOW.toISOString() : null,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString()
})

describe('planDueNotifications', () => {
  const tasks = [
    mk('due-now', '2026-10-21T10:30'),
    mk('due-earlier', '2026-10-21T08:00'),
    mk('future', '2026-10-21T11:00'),
    mk('date-only', '2026-10-20'),
    mk('done', '2026-10-21T09:00', true),
    mk('ancient', '2026-10-01T09:00')
  ]
  it('notifies timed, active tasks whose time has come', () => {
    const plan = planDueNotifications(tasks, NOW, () => false)
    expect(plan.show.map((t) => t.id)).toEqual(['due-now', 'due-earlier'])
    expect(plan.skip.map((t) => t.id)).toEqual(['ancient'])
  })
  it('notifies each task/due pair only once', () => {
    const seen = new Set(['due-now|2026-10-21T10:30'])
    const plan = planDueNotifications(tasks, NOW, (k) => seen.has(k))
    expect(plan.show.map((t) => t.id)).toEqual(['due-earlier'])
  })
  it('key changes when the due date changes', () => {
    expect(notificationKey(mk('a', '2026-10-21T10:30'))).not.toBe(notificationKey(mk('a', '2026-10-22T10:30')))
  })
})
