import { describe, expect, it } from 'vitest'
import {
  classifyDue,
  countdownLabel,
  dayDiff,
  dueDeadline,
  formatDueLong,
  formatTime,
  isValidDue,
  msUntilNextMinute,
  normalizeDue,
  parseDue,
  splitDue,
  toDueString
} from '../src/shared/dates'

// Wed Oct 21 2026, 10:30 local time
const NOW = new Date(2026, 9, 21, 10, 30, 0)

describe('parseDue / isValidDue', () => {
  it('parses date-only and date-time strings', () => {
    expect(parseDue('2026-10-21')).toMatchObject({ year: 2026, month: 10, day: 21, hasTime: false })
    expect(parseDue('2026-10-21T17:05')).toMatchObject({ hour: 17, minute: 5, hasTime: true })
  })
  it('rejects malformed or impossible dates', () => {
    for (const bad of ['', '2026-13-01', '2026-02-30', '2026-10-21T24:00', '2026-10-21T10:60', 'tomorrow', '21/10/2026']) {
      expect(isValidDue(bad)).toBe(false)
    }
    expect(isValidDue('2028-02-29')).toBe(true)
    expect(parseDue(null)).toBeNull()
  })
})

describe('dueDeadline', () => {
  it('treats a date-only due as the end of that day', () => {
    const d = dueDeadline('2026-10-21')!
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([23, 59, 59, 999])
  })
  it('uses the exact time when given', () => {
    expect(dueDeadline('2026-10-21T09:15')!.getTime()).toBe(new Date(2026, 9, 21, 9, 15).getTime())
  })
})

describe('classifyDue', () => {
  it('returns none without a due date', () => {
    expect(classifyDue(null, NOW)).toBe('none')
  })
  it('date-only today is today (not overdue) until midnight', () => {
    expect(classifyDue('2026-10-21', NOW)).toBe('today')
    expect(classifyDue('2026-10-21', new Date(2026, 9, 21, 23, 59, 59))).toBe('today')
    expect(classifyDue('2026-10-21', new Date(2026, 9, 22, 0, 0, 0))).toBe('overdue')
  })
  it('timed task earlier today is overdue, later today is today', () => {
    expect(classifyDue('2026-10-21T09:00', NOW)).toBe('overdue')
    expect(classifyDue('2026-10-21T17:00', NOW)).toBe('today')
  })
  it('past days are overdue', () => {
    expect(classifyDue('2026-10-20', NOW)).toBe('overdue')
  })
  it('1..7 days ahead is week, beyond is later', () => {
    expect(classifyDue('2026-10-22', NOW)).toBe('week')
    expect(classifyDue('2026-10-28T23:00', NOW)).toBe('week')
    expect(classifyDue('2026-10-29', NOW)).toBe('later')
  })
  it('handles month and year boundaries', () => {
    const nye = new Date(2026, 11, 31, 12, 0)
    expect(dayDiff('2027-01-01', nye)).toBe(1)
    expect(classifyDue('2027-01-07', nye)).toBe('week')
  })
})

describe('countdownLabel', () => {
  it('formats upcoming dues', () => {
    expect(countdownLabel('2026-10-21T17:00', NOW)).toBe('Today 5:00 PM')
    expect(countdownLabel('2026-10-21', NOW)).toBe('Today')
    expect(countdownLabel('2026-10-22', NOW)).toBe('Tomorrow')
    expect(countdownLabel('2026-10-22T09:05', NOW)).toBe('Tomorrow 9:05 AM')
    expect(countdownLabel('2026-10-24', NOW)).toBe('in 3 days')
    expect(countdownLabel('2026-11-20', NOW)).toBe('in 30 days')
    expect(countdownLabel('2026-11-21', NOW)).toBe('Nov 21')
    expect(countdownLabel('2027-03-02', NOW)).toBe('Mar 2, 2027')
  })
  it('formats overdue dues', () => {
    expect(countdownLabel('2026-10-21T10:10', NOW)).toBe('20 min overdue')
    expect(countdownLabel('2026-10-21T10:30', new Date(2026, 9, 21, 10, 30, 20))).toBe('1 min overdue')
    expect(countdownLabel('2026-10-21T07:00', NOW)).toBe('3 h overdue')
    expect(countdownLabel('2026-10-20', NOW)).toBe('1 day overdue')
    expect(countdownLabel('2026-10-19T18:00', NOW)).toBe('2 days overdue')
  })
  it('flips across midnight', () => {
    expect(countdownLabel('2026-10-22', new Date(2026, 9, 21, 23, 59))).toBe('Tomorrow')
    expect(countdownLabel('2026-10-22', new Date(2026, 9, 22, 0, 0))).toBe('Today')
    expect(countdownLabel('2026-10-21', new Date(2026, 9, 22, 0, 0))).toBe('1 day overdue')
  })
  it('handles no due date', () => {
    expect(countdownLabel(null, NOW)).toBe('No due date')
  })
})

describe('formatting helpers', () => {
  it('formatTime uses 12h clock', () => {
    expect(formatTime(0, 0)).toBe('12:00 AM')
    expect(formatTime(12, 5)).toBe('12:05 PM')
    expect(formatTime(23, 59)).toBe('11:59 PM')
  })
  it('formatDueLong', () => {
    expect(formatDueLong('2026-10-21T17:00')).toBe('Wed, Oct 21, 2026 · 5:00 PM')
    expect(formatDueLong('2026-10-21')).toBe('Wed, Oct 21, 2026')
    expect(formatDueLong(null)).toBe('No due date')
  })
  it('toDueString / splitDue round trip', () => {
    expect(toDueString('2026-10-21')).toBe('2026-10-21')
    expect(toDueString('2026-10-21', '08:30')).toBe('2026-10-21T08:30')
    expect(toDueString('2026-10-21', '')).toBe('2026-10-21')
    expect(toDueString('')).toBeNull()
    expect(toDueString('2026-02-31')).toBeNull()
    expect(splitDue('2026-10-21T08:30')).toEqual({ date: '2026-10-21', time: '08:30' })
    expect(splitDue('2026-10-21')).toEqual({ date: '2026-10-21', time: '' })
    expect(splitDue(null)).toEqual({ date: '', time: '' })
  })
  it('normalizeDue accepts legacy ISO timestamps', () => {
    expect(normalizeDue('2026-10-21')).toBe('2026-10-21')
    expect(normalizeDue('2026-10-21T08:30:00')).toBe('2026-10-21T08:30')
    const iso = new Date(2026, 9, 21, 8, 30).toISOString()
    expect(normalizeDue(iso)).toBe('2026-10-21T08:30')
    expect(normalizeDue('garbage')).toBeNull()
    expect(normalizeDue(42)).toBeNull()
    expect(normalizeDue('')).toBeNull()
  })
  it('msUntilNextMinute lands just after the boundary', () => {
    expect(msUntilNextMinute(new Date(2026, 9, 21, 10, 30, 59, 900))).toBe(150)
    expect(msUntilNextMinute(new Date(2026, 9, 21, 10, 30, 0, 0))).toBe(60_050)
  })
})
