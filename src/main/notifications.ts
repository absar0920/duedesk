import { Notification } from 'electron'
import { formatDueLong } from '../shared/dates'
import { notificationKey, planDueNotifications } from '../shared/notify'
import { iconPath } from './paths'
import type { Store } from './store'

const CHECK_INTERVAL_MS = 15_000
/** Notifications kept alive so clicks from Action Center still reach their handler. */
const MAX_LIVE = 50

/** Shows a native notification once when a timed task reaches its due time. */
export class DueNotifier {
  private timer: NodeJS.Timeout | null = null
  // Keep references so click handlers are not garbage collected. Entries are not dropped on
  // 'close' because a dismissed toast moves to Action Center and can still be clicked there.
  private live = new Map<string, Notification>()

  constructor(
    private readonly store: Store,
    private readonly onOpenTask: (id: string) => void
  ) {}

  start(): void {
    this.check()
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  check(): void {
    const plan = planDueNotifications(this.store.getTasks(), new Date(), (k) => this.store.isNotified(k))
    if (plan.show.length === 0 && plan.skip.length === 0) return
    const supported = Notification.isSupported()
    for (const task of plan.show) {
      if (!supported) break
      const n = new Notification({
        title: `Due now: ${task.name}`,
        body: task.description ? `${formatDueLong(task.dueAt)}\n${task.description.slice(0, 160)}` : formatDueLong(task.dueAt),
        icon: iconPath('png'),
        silent: false
      })
      const key = notificationKey(task)
      this.live.delete(key)
      this.live.set(key, n)
      while (this.live.size > MAX_LIVE) this.live.delete(this.live.keys().next().value!)
      n.on('click', () => this.onOpenTask(task.id))
      n.show()
    }
    this.store.markNotified([...plan.show, ...plan.skip].map(notificationKey))
  }
}
