import { dueDeadline, hasDueTime } from './dates'
import type { Task } from './types'

export const NOTIFY_GRACE_MS = 24 * 60 * 60 * 1000

export function notificationKey(task: Pick<Task, 'id' | 'dueAt'>): string {
  return `${task.id}|${task.dueAt ?? ''}`
}

export interface DueNotificationPlan {
  /** Tasks whose due time just passed: show a notification. */
  show: Task[]
  /** Tasks that became due long ago (e.g. while the app was closed): mark as handled silently. */
  skip: Task[]
}

/**
 * Decides which tasks need a "due now" notification. Only tasks with an explicit time
 * qualify; each (task, dueAt) pair is notified at most once.
 */
export function planDueNotifications(
  tasks: Task[],
  now: Date,
  isNotified: (key: string) => boolean,
  graceMs = NOTIFY_GRACE_MS
): DueNotificationPlan {
  const plan: DueNotificationPlan = { show: [], skip: [] }
  for (const t of tasks) {
    if (t.completed || !hasDueTime(t.dueAt)) continue
    const deadline = dueDeadline(t.dueAt)!
    if (deadline.getTime() > now.getTime()) continue
    if (isNotified(notificationKey(t))) continue
    if (now.getTime() - deadline.getTime() <= graceMs) plan.show.push(t)
    else plan.skip.push(t)
  }
  return plan
}
