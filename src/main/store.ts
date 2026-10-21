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
}

export function dataFilePath(dir: string): string {
  return path.join(dir, DATA_FILE_NAME)
}

export function loadData(dir: string): LoadResult {
  const file = dataFilePath(dir)
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { data: defaultData() }
    throw err
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
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
    this.loadInfo = info
    if (info.migratedFrom !== undefined && !this.firstRun) saveData(dir, this.data)
  }

  onChange(fn: (kind: ChangeKind) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private commit(kind: ChangeKind): void {
    saveData(this.dir, this.data)
    for (const l of this.listeners) l(kind)
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

  createTask(input: TaskInput): Task {
    const now = this.clock().toISOString()
    const task: Task = {
      id: randomUUID(),
      name: this.cleanName(input.name),
      description: typeof input.description === 'string' ? input.description.slice(0, DESCRIPTION_MAX) : '',
      dueAt: normalizeDue(input.dueAt ?? null),
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    }
    this.data.tasks.push(task)
    this.commit('tasks')
    return { ...task }
  }

  updateTask(id: string, patch: TaskPatch): Task {
    const task = this.data.tasks.find((t) => t.id === id)
    if (!task) throw new ValidationError('Task not found')
    const now = this.clock().toISOString()
    if (patch.name !== undefined) task.name = this.cleanName(patch.name)
    if (patch.description !== undefined) task.description = String(patch.description).slice(0, DESCRIPTION_MAX)
    if (patch.dueAt !== undefined) task.dueAt = normalizeDue(patch.dueAt)
    if (patch.completed !== undefined && patch.completed !== task.completed) {
      task.completed = Boolean(patch.completed)
      task.completedAt = task.completed ? now : null
    }
    task.updatedAt = now
    this.commit('tasks')
    return { ...task }
  }

  toggleTask(id: string): Task {
    const task = this.data.tasks.find((t) => t.id === id)
    if (!task) throw new ValidationError('Task not found')
    return this.updateTask(id, { completed: !task.completed })
  }

  deleteTask(id: string): boolean {
    const before = this.data.tasks.length
    this.data.tasks = this.data.tasks.filter((t) => t.id !== id)
    if (this.data.tasks.length === before) return false
    this.data.notified = this.data.notified.filter((k) => !k.startsWith(`${id}|`))
    this.commit('tasks')
    return true
  }

  setLaunchAtStartup(value: boolean): void {
    this.data.settings.launchAtStartup = Boolean(value)
    this.commit('settings')
  }

  addWidget(bounds: Pick<Bounds, 'x' | 'y'> & Partial<Bounds>, overrides: WidgetPatch = {}): WidgetConfig {
    const widget = sanitizeWidget({ ...WIDGET_DEFAULTS, ...overrides, ...bounds, id: randomUUID() })!
    this.data.settings.widgets.push(widget)
    this.commit('settings')
    return { ...widget }
  }

  updateWidget(id: string, patch: WidgetPatch): WidgetConfig {
    const idx = this.data.settings.widgets.findIndex((w) => w.id === id)
    if (idx < 0) throw new ValidationError('Widget not found')
    const merged = sanitizeWidget({ ...this.data.settings.widgets[idx], ...patch, id })!
    this.data.settings.widgets[idx] = merged
    this.commit('settings')
    return { ...merged }
  }

  removeWidget(id: string): boolean {
    const before = this.data.settings.widgets.length
    this.data.settings.widgets = this.data.settings.widgets.filter((w) => w.id !== id)
    if (this.data.settings.widgets.length === before) return false
    this.commit('settings')
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
