import type { DueString } from './types'

export type DueClass = 'overdue' | 'today' | 'week' | 'later' | 'none'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface ParsedDue {
  year: number
  month: number // 1-12
  day: number
  hour: number | null
  minute: number | null
  hasTime: boolean
}

const pad = (n: number): string => String(n).padStart(2, '0')

function validCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  return d <= new Date(y, m, 0).getDate()
}

/** Parses a due string; returns null for anything malformed. */
export function parseDue(due: DueString | null | undefined): ParsedDue | null {
  if (!due) return null
  let m = DATE_RE.exec(due)
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (!validCalendarDate(y, mo, d)) return null
    return { year: y, month: mo, day: d, hour: null, minute: null, hasTime: false }
  }
  m = DATETIME_RE.exec(due)
  if (m) {
    const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]
    if (!validCalendarDate(y, mo, d) || h > 23 || mi > 59) return null
    return { year: y, month: mo, day: d, hour: h, minute: mi, hasTime: true }
  }
  return null
}

export function isValidDue(due: unknown): due is DueString {
  return typeof due === 'string' && parseDue(due) !== null
}

export function hasDueTime(due: DueString | null | undefined): boolean {
  return parseDue(due)?.hasTime ?? false
}

/** The moment a task becomes overdue. Date-only dues end at 23:59:59.999 local time. */
export function dueDeadline(due: DueString | null | undefined): Date | null {
  const p = parseDue(due)
  if (!p) return null
  if (p.hasTime) return new Date(p.year, p.month - 1, p.day, p.hour!, p.minute!, 0, 0)
  return new Date(p.year, p.month - 1, p.day, 23, 59, 59, 999)
}

/** Whole calendar days from `now`'s date to the due date (negative = past). DST safe. */
export function dayDiff(due: DueString | null | undefined, now: Date): number | null {
  const p = parseDue(due)
  if (!p) return null
  const a = Date.UTC(p.year, p.month - 1, p.day)
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((a - b) / 86_400_000)
}

export function classifyDue(due: DueString | null | undefined, now: Date): DueClass {
  const deadline = dueDeadline(due)
  if (!deadline) return 'none'
  if (deadline.getTime() < now.getTime()) return 'overdue'
  const d = dayDiff(due, now)!
  if (d === 0) return 'today'
  if (d <= 7) return 'week'
  return 'later'
}

export function formatTime(hour: number, minute: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${pad(minute)} ${suffix}`
}

function formatShortDate(p: ParsedDue, now: Date): string {
  const base = `${MONTHS[p.month - 1]} ${p.day}`
  return p.year === now.getFullYear() ? base : `${base}, ${p.year}`
}

/** Short relative label shown next to every task, e.g. "Today 5:00 PM", "in 3 days", "2 days overdue". */
export function countdownLabel(due: DueString | null | undefined, now: Date): string {
  const p = parseDue(due)
  if (!p) return 'No due date'
  const deadline = dueDeadline(due)!
  const d = dayDiff(due, now)!
  const time = p.hasTime ? formatTime(p.hour!, p.minute!) : ''

  if (deadline.getTime() < now.getTime()) {
    const elapsed = now.getTime() - deadline.getTime()
    // Timed dues: label by elapsed time so "23:59 yesterday" reads "2 min overdue", not "1 day".
    if (p.hasTime && elapsed < 86_400_000) {
      const mins = Math.max(1, Math.floor(elapsed / 60_000))
      return mins < 60 ? `${mins} min overdue` : `${Math.floor(mins / 60)} h overdue`
    }
    const n = Math.max(1, -d)
    return n === 1 ? '1 day overdue' : `${n} days overdue`
  }
  if (d === 0) return time ? `Today ${time}` : 'Today'
  if (d === 1) return time ? `Tomorrow ${time}` : 'Tomorrow'
  if (d <= 30) return `in ${d} days`
  return formatShortDate(p, now)
}

/** Long human readable form, e.g. "Wed, Oct 21, 2026 · 5:00 PM". */
export function formatDueLong(due: DueString | null | undefined): string {
  const p = parseDue(due)
  if (!p) return 'No due date'
  const wd = WEEKDAYS[new Date(p.year, p.month - 1, p.day).getDay()]
  const date = `${wd}, ${MONTHS[p.month - 1]} ${p.day}, ${p.year}`
  return p.hasTime ? `${date} · ${formatTime(p.hour!, p.minute!)}` : date
}

/** Builds a due string from <input type="date"> and optional <input type="time"> values. */
export function toDueString(date: string, time?: string | null): DueString | null {
  if (!date || !DATE_RE.test(date)) return null
  const candidate = time && /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}` : date
  return isValidDue(candidate) ? candidate : null
}

/** Splits a due string into values suitable for date/time inputs. */
export function splitDue(due: DueString | null | undefined): { date: string; time: string } {
  const p = parseDue(due)
  if (!p) return { date: '', time: '' }
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`
  return { date, time: p.hasTime ? `${pad(p.hour!)}:${pad(p.minute!)}` : '' }
}

export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Strict ISO-8601 timestamp with an explicit zone, e.g. "2026-10-21T17:00:00Z". */
const ISO_ZONED_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

/**
 * Coerces unknown values into a valid due string. Accepts the native formats, local
 * "YYYY-MM-DDTHH:mm:ss(.sss)" and zoned ISO-8601 timestamps (converted to local
 * wall-clock time). Anything else returns null.
 */
export function normalizeDue(value: unknown): DueString | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const v = value.trim()
  if (isValidDue(v)) return v
  const secs = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}(\.\d+)?$/.exec(v)
  if (secs && isValidDue(secs[1])) return secs[1]
  if (!ISO_ZONED_RE.test(v)) return null
  const t = Date.parse(v)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  return `${localDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Milliseconds until the next wall-clock minute boundary (plus a small margin). */
export function msUntilNextMinute(now: Date): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50
}
