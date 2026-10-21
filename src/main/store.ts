/**
 * JSON persistence for DueDesk. Pure Node (no Electron imports) so it can be unit tested.
 * Writes are atomic: data goes to a temp file which is fsynced and then renamed over the target.
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  DATA_FILE_NAME,
  FILTER_IDS,
  SCHEMA_VERSION,
  SORT_IDS,
  WIDGET_DEFAULTS,
  WIDGET_MIN_HEIGHT,
  WIDGET_MIN_WIDTH
} from '../shared/constants'
import { normalizeDue } from '../shared/dates'
import { notificationKey } from '../shared/notify'
import type {
  Bounds,
  Settings,
  StoreData,
  Task,
  TaskFilter,
  TaskInput,
  TaskPatch,
  TaskSort,
  WidgetConfig,
  WidgetPatch
} from '../shared/types'

export const NAME_MAX = 500
export const DESCRIPTION_MAX = 20_000

export function defaultData(): StoreData {
  return {
    version: SCHEMA_VERSION,
    tasks: [],
    settings: { launchAtStartup: false, widgets: [] },
    notified: []
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback)
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))
const isoOr = (v: unknown, fallback: string | null): string | null =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback

export function sanitizeTask(raw: unknown, nowIso: string): Task | null {
  if (!isObj(raw)) return null
  const name = str(raw.name ?? raw.title).trim().slice(0, NAME_MAX)
  if (!name) return null
  const completed = bool(raw.completed ?? raw.done)
  const createdAt = isoOr(raw.createdAt, nowIso)!
  return {
    id: str(raw.id) || randomUUID(),
    name,
    description: str(raw.description ?? raw.notes).slice(0, DESCRIPTION_MAX),
    dueAt: normalizeDue(raw.dueAt ?? raw.due),
    completed,
    completedAt: completed ? isoOr(raw.completedAt, nowIso) : null,
    createdAt,
    updatedAt: isoOr(raw.updatedAt, createdAt)!
  }
}

export function sanitizeWidget(raw: unknown): WidgetConfig | null {
  if (!isObj(raw)) return null
  const filter = FILTER_IDS.includes(raw.filter as TaskFilter) ? (raw.filter as TaskFilter) : WIDGET_DEFAULTS.filter
  const sort = SORT_IDS.includes(raw.sort as TaskSort) ? (raw.sort as TaskSort) : WIDGET_DEFAULTS.sort
  return {
    id: str(raw.id) || randomUUID(),
    x: Math.round(num(raw.x, 100)),
    y: Math.round(num(raw.y, 100)),
    width: Math.round(Math.max(WIDGET_MIN_WIDTH, num(raw.width, WIDGET_DEFAULTS.width))),
    height: Math.round(Math.max(WIDGET_MIN_HEIGHT, num(raw.height, WIDGET_DEFAULTS.height))),
    filter,
    sort,
    showCompleted: bool(raw.showCompleted, WIDGET_DEFAULTS.showCompleted),
    locked: bool(raw.locked, WIDGET_DEFAULTS.locked),
    opacity: clamp(num(raw.opacity, WIDGET_DEFAULTS.opacity), 0.1, 1),
    alwaysOnTop: bool(raw.alwaysOnTop, WIDGET_DEFAULTS.alwaysOnTop)
  }
}

function sanitizeSettings(raw: unknown): Settings {
  const s = isObj(raw) ? raw : {}
  const widgets = (Array.isArray(s.widgets) ? s.widgets : [])
    .map(sanitizeWidget)
    .filter((w): w is WidgetConfig => w !== null)
  return { launchAtStartup: bool(s.launchAtStartup), widgets: dedupeById(widgets) }
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
}

/**
 * Upgrades any previously persisted shape to the current schema.
 *  - v0 (unversioned): either a bare array of tasks or `{ tasks, settings? }` without `version`.
 *  - v1: current.
 * Newer versions written by a future build are read best-effort (known fields only).
 */
export function migrate(raw: unknown, now: Date = new Date()): StoreData {
  const nowIso = now.toISOString()
  let source: Record<string, unknown>
  if (Array.isArray(raw)) source = { tasks: raw }
  else if (isObj(raw)) source = raw
  else return defaultData()

  const tasks = dedupeById(
    (Array.isArray(source.tasks) ? source.tasks : [])
      .map((t) => sanitizeTask(t, nowIso))
      .filter((t): t is Task => t !== null)
  )
  const notified = Array.isArray(source.notified) ? source.notified.filter((n): n is string => typeof n === 'string') : []
  return { version: SCHEMA_VERSION, tasks, settings: sanitizeSettings(source.settings), notified }
}

export interface LoadResult {
  data: StoreData
  /** Path the unreadable file was moved to, if the data file was corrupt. */
  backupPath?: string
  migratedFrom?: number
  /** Copy of the original file kept before a migration rewrote it. */
  migrationBackupPath?: string
}

export function dataFilePath(dir: string): string {
  return path.join(dir, DATA_FILE_NAME)
}

/** Removes temp files orphaned by a crash between writing and renaming in saveData(). */
export function cleanupTempFiles(dir: string): void {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (name.startsWith(`${DATA_FILE_NAME}.`) && name.endsWith('.tmp')) {
      try {
        fs.rmSync(path.join(dir, name), { force: true })
      } catch {
        /* still locked; try again next launch */
      }
    }
  }
}

/** True when a parsed root looks like something migrate() understands. */
function isRecognizedShape(raw: unknown): boolean {
  if (Array.isArray(raw)) return true
  if (!isObj(raw)) return false
  if ('tasks' in raw && !Array.isArray(raw.tasks)) return false
  if ('settings' in raw && raw.settings !== undefined && !isObj(raw.settings)) return false
  return true
}

export function loadData(dir: string): LoadResult {
  const file = dataFilePath(dir)
  cleanupTempFiles(dir)
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { data: defaultData() }
    throw err
  }
  let raw: unknown
  let parsed = true
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    parsed = false
  }
  // Valid JSON of the wrong shape (null, "x", 42, {"tasks":"oops"}) is just as unreadable.
  if (!parsed || !isRecognizedShape(raw)) {
    const backupPath = `${file}.corrupt-${Date.now()}`
    fs.renameSync(file, backupPath)
    return { data: defaultData(), backupPath }
  }
  const version = isObj(raw) && typeof raw.version === 'number' ? raw.version : 0
  const data = migrate(raw)
  return version === SCHEMA_VERSION ? { data } : { data, migratedFrom: version }
}

function renameWithRetry(from: string, to: string): void {
  // On Windows, antivirus/indexers can briefly lock the target; retry a few times.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= 5 || (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')) throw err
      const until = Date.now() + 20 * (attempt + 1)
      while (Date.now() < until) {
        /* short synchronous back-off */
      }
    }
  }
}

export function saveData(dir: string, data: StoreData): void {
  fs.mkdirSync(dir, { recursive: true })
  const file = dataFilePath(dir)
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  const json = JSON.stringify({ ...data, version: SCHEMA_VERSION }, null, 2)
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeFileSync(fd, json, 'utf8')
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  try {
    renameWithRetry(tmp, file)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}

export class ValidationError extends Error {}

export type ChangeKind = 'tasks' | 'settings'

/** In-memory state with persistence on every mutation. */
export class Store {
  private data: StoreData
  private listeners = new Set<(kind: ChangeKind) => void>()
  /** True when no data file existed yet (first launch). */
  readonly firstRun: boolean
  readonly loadInfo: Omit<LoadResult, 'data'>

  constructor(
    private readonly dir: string,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.firstRun = !fs.existsSync(dataFilePath(dir))
    const { data, ...info } = loadData(dir)
    this.data = data
    if (info.migratedFrom !== undefined && !this.firstRun) {
      // Keep the original before rewriting it in the current schema: a file from a newer
      // version may hold fields this build does not know and would otherwise drop.
      const file = dataFilePath(dir)
      const backup = `${file}.v${info.migratedFrom}-backup-${Date.now()}`
      fs.copyFileSync(file, backup)
      info.migrationBackupPath = backup
      saveData(dir, this.data)
    }
    this.loadInfo = info
  }

  onChange(fn: (kind: ChangeKind) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /**
   * Runs a mutation and persists it. If the mutation throws or the save fails, the in-memory
   * state is rolled back so memory, disk and the renderers never disagree.
   */
  private transact<T>(kind: ChangeKind, fn: () => T): T {
    const snapshot = structuredClone(this.data)
    let result: T
    try {
      result = fn()
      saveData(this.dir, this.data)
    } catch (err) {
      this.data = snapshot
      throw err
    }
    for (const l of this.listeners) l(kind)
    return result
  }

  getTasks(): Task[] {
    return this.data.tasks.map((t) => ({ ...t }))
  }

  getTask(id: string): Task | undefined {
    const t = this.data.tasks.find((x) => x.id === id)
    return t ? { ...t } : undefined
  }

  getSettings(): Settings {
    return { ...this.data.settings, widgets: this.data.settings.widgets.map((w) => ({ ...w })) }
  }

  getWidget(id: string): WidgetConfig | undefined {
    const w = this.data.settings.widgets.find((x) => x.id === id)
    return w ? { ...w } : undefined
  }

  private cleanName(name: unknown): string {
    const n = typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : ''
    if (!n) throw new ValidationError('Task name is required')
    return n
  }

  private cleanDescription(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value !== 'string') throw new ValidationError('Description must be text')
    return value.slice(0, DESCRIPTION_MAX)
  }

  /** null, undefined or '' clear the due date; anything else must be a valid due value. */
  private cleanDue(value: unknown): Task['dueAt'] {
    if (value === null || value === undefined || value === '') return null
    const due = normalizeDue(value)
    if (due === null) throw new ValidationError('Invalid due date')
    return due
  }

  createTask(input: TaskInput): Task {
    const now = this.clock().toISOString()
    const task: Task = {
      id: randomUUID(),
      name: this.cleanName(input.name),
      description: this.cleanDescription(input.description),
      dueAt: this.cleanDue(input.dueAt),
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    }
    this.transact('tasks', () => this.data.tasks.push(task))
    return { ...task }
  }

  updateTask(id: string, patch: TaskPatch): Task {
    const current = this.data.tasks.find((t) => t.id === id)
    if (!current) throw new ValidationError('Task not found')
    // Validate everything before touching state.
    const next: Task = { ...current }
    const now = this.clock().toISOString()
    if (patch.name !== undefined) next.name = this.cleanName(patch.name)
    if (patch.description !== undefined) next.description = this.cleanDescription(patch.description)
    if (patch.dueAt !== undefined) next.dueAt = this.cleanDue(patch.dueAt)
    if (patch.completed !== undefined) {
      if (typeof patch.completed !== 'boolean') throw new ValidationError('completed must be true or false')
      if (patch.completed !== current.completed) {
        next.completed = patch.completed
        next.completedAt = patch.completed ? now : null
      }
    }
    next.updatedAt = now
    this.transact('tasks', () => {
      this.data.tasks = this.data.tasks.map((t) => (t.id === id ? next : t))
    })
    return { ...next }
  }

  toggleTask(id: string): Task {
    const task = this.data.tasks.find((t) => t.id === id)
    if (!task) throw new ValidationError('Task not found')
    return this.updateTask(id, { completed: !task.completed })
  }

  deleteTask(id: string): boolean {
    if (!this.data.tasks.some((t) => t.id === id)) return false
    this.transact('tasks', () => {
      this.data.tasks = this.data.tasks.filter((t) => t.id !== id)
      this.data.notified = this.data.notified.filter((k) => !k.startsWith(`${id}|`))
    })
    return true
  }

  setLaunchAtStartup(value: boolean): void {
    this.transact('settings', () => {
      this.data.settings.launchAtStartup = Boolean(value)
    })
  }

  addWidget(bounds: Pick<Bounds, 'x' | 'y'> & Partial<Bounds>, overrides: WidgetPatch = {}): WidgetConfig {
    const widget = sanitizeWidget({ ...WIDGET_DEFAULTS, ...overrides, ...bounds, id: randomUUID() })!
    this.transact('settings', () => this.data.settings.widgets.push(widget))
    return { ...widget }
  }

  updateWidget(id: string, patch: WidgetPatch): WidgetConfig {
    const idx = this.data.settings.widgets.findIndex((w) => w.id === id)
    if (idx < 0) throw new ValidationError('Widget not found')
    const merged = sanitizeWidget({ ...this.data.settings.widgets[idx], ...patch, id })!
    this.transact('settings', () => {
      this.data.settings.widgets[idx] = merged
    })
    return { ...merged }
  }

  removeWidget(id: string): boolean {
    if (!this.data.settings.widgets.some((w) => w.id === id)) return false
    this.transact('settings', () => {
      this.data.settings.widgets = this.data.settings.widgets.filter((w) => w.id !== id)
    })
    return true
  }

  isNotified(key: string): boolean {
    return this.data.notified.includes(key)
  }

  /** Records notification keys and drops keys whose task/due no longer exists. Persists silently. */
  markNotified(keys: string[]): void {
    const valid = new Set(this.data.tasks.filter((t) => t.dueAt).map((t) => notificationKey(t)))
    const next = new Set(this.data.notified.filter((k) => valid.has(k)))
    for (const k of keys) next.add(k)
    this.data.notified = [...next]
    saveData(this.dir, this.data)
  }
}
