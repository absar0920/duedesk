import { useEffect, useState } from 'react'
import { msUntilNextMinute } from '@shared/dates'
import type { Settings, Task } from '@shared/types'

const api = window.duedesk

/** Live task list + settings, kept in sync with the main process broadcasts. */
export function useAppData(): { tasks: Task[]; settings: Settings | null; loaded: boolean } {
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    const offTasks = api.on.tasks((t) => alive && setTasks(t))
    const offSettings = api.on.settings((s) => alive && setSettings(s))
    void Promise.all([api.tasks.list(), api.settings.get()]).then(([t, s]) => {
      if (!alive) return
      setTasks(t)
      setSettings(s)
      setLoaded(true)
    })
    return () => {
      alive = false
      offTasks()
      offSettings()
    }
  }, [])

  return { tasks, settings, loaded }
}

/**
 * Current time, refreshed on every wall-clock minute (so "Today"/"overdue" labels flip at
 * midnight) and whenever the window regains visibility/focus (e.g. after sleep).
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: number
    const tick = (): void => {
      setNow(new Date())
      timer = window.setTimeout(tick, msUntilNextMinute(new Date()))
    }
    timer = window.setTimeout(tick, msUntilNextMinute(new Date()))
    const refresh = (): void => setNow(new Date())
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return now
}

/** Closes popovers when clicking outside of `ref` or pressing Escape. */
export function useDismiss(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void
): void {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, open, onClose])
}
