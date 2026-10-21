import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATA_FILE_NAME, SCHEMA_VERSION, WIDGET_DEFAULTS } from '../src/shared/constants'
import { dataFilePath, defaultData, loadData, migrate, saveData, Store, ValidationError } from '../src/main/store'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duedesk-test-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const writeRaw = (content: string): void => fs.writeFileSync(path.join(dir, DATA_FILE_NAME), content)
const readRaw = (): Record<string, unknown> => JSON.parse(fs.readFileSync(dataFilePath(dir), 'utf8'))

describe('loadData', () => {
  it('returns defaults when no file exists', () => {
    expect(loadData(dir)).toEqual({ data: defaultData() })
  })

  it('backs up a corrupt file and starts fresh', () => {
    writeRaw('{ not json')
    const res = loadData(dir)
    expect(res.data).toEqual(defaultData())
    expect(res.backupPath).toBeDefined()
    expect(fs.readFileSync(res.backupPath!, 'utf8')).toBe('{ not json')
    expect(fs.existsSync(dataFilePath(dir))).toBe(false)
  })

  it.each(['null', '"x"', '42', '{"tasks":"oops"}', '{"tasks":[],"settings":3}'])(
    'treats valid JSON of the wrong shape (%s) as corrupt',
    (content) => {
      writeRaw(content)
      const res = loadData(dir)
      expect(res.data).toEqual(defaultData())
      expect(fs.readFileSync(res.backupPath!, 'utf8')).toBe(content)
      expect(fs.existsSync(dataFilePath(dir))).toBe(false)
    }
  )

  it('removes temp files orphaned by an interrupted save', () => {
    saveData(dir, defaultData())
    const orphan = path.join(dir, `${DATA_FILE_NAME}.1234.abcd1234.tmp`)
    fs.writeFileSync(orphan, '{"partial')
    loadData(dir)
    expect(fs.existsSync(orphan)).toBe(false)
    expect(fs.existsSync(dataFilePath(dir))).toBe(true)
  })

  it('tolerates a UTF-8 BOM', () => {
    writeRaw('﻿' + JSON.stringify(defaultData()))
    expect(loadData(dir).data).toEqual(defaultData())
  })
})

describe('migrate', () => {
  it('upgrades an unversioned bare array of tasks (v0)', () => {
    writeRaw(
      JSON.stringify([
        { id: 'a', title: 'Legacy title', due: '2026-10-21T08:30:00', done: true },
        { id: 'b', name: '  Trim me  ', dueAt: '2026-10-22' },
        { id: 'c', name: '' },
        'garbage'
      ])
    )
    const res = loadData(dir)
    expect(res.migratedFrom).toBe(0)
    expect(res.data.version).toBe(SCHEMA_VERSION)
    expect(res.data.tasks).toHaveLength(2)
    const [a, b] = res.data.tasks
    expect(a).toMatchObject({ id: 'a', name: 'Legacy title', dueAt: '2026-10-21T08:30', completed: true })
    expect(a.completedAt).not.toBeNull()
    expect(b).toMatchObject({ id: 'b', name: 'Trim me', dueAt: '2026-10-22', completed: false, description: '' })
    expect(res.data.settings).toEqual({ launchAtStartup: false, widgets: [] })
  })

  it('sanitizes widgets and settings', () => {
    const data = migrate({
      version: 1,
      tasks: [],
      settings: {
        launchAtStartup: true,
        widgets: [
          { id: 'w1', x: 10, y: 20, width: 50, height: 9999, filter: 'bogus', sort: 'name', opacity: 7, locked: true },
          { id: 'w1', x: 0, y: 0 },
          null
        ]
      }
    })
    expect(data.settings.launchAtStartup).toBe(true)
    expect(data.settings.widgets).toHaveLength(1)
    expect(data.settings.widgets[0]).toMatchObject({
      id: 'w1',
      width: 220,
      height: 9999,
      filter: 'all',
      sort: 'name',
      opacity: 1,
      locked: true,
      alwaysOnTop: false,
      showCompleted: false
    })
  })

  it('returns defaults for non-object input', () => {
    expect(migrate(null)).toEqual(defaultData())
    expect(migrate(42)).toEqual(defaultData())
  })
})

describe('saveData (atomic)', () => {
  it('round-trips and leaves no temp files', () => {
    const data = defaultData()
    data.settings.launchAtStartup = true
    saveData(dir, data)
    saveData(dir, data) // overwrite existing file
    expect(fs.readdirSync(dir)).toEqual([DATA_FILE_NAME])
    expect(loadData(dir).data).toEqual(data)
    expect(readRaw().version).toBe(SCHEMA_VERSION)
  })

  it('creates the directory if missing', () => {
    const nested = path.join(dir, 'a', 'b')
    saveData(nested, defaultData())
    expect(fs.existsSync(dataFilePath(nested))).toBe(true)
  })

  it('keeps the previous file intact when the write fails', () => {
    saveData(dir, defaultData())
    const before = fs.readFileSync(dataFilePath(dir), 'utf8')
    const circular = defaultData() as unknown as Record<string, unknown>
    circular.self = circular
    expect(() => saveData(dir, circular as never)).toThrow()
    expect(fs.readFileSync(dataFilePath(dir), 'utf8')).toBe(before)
    expect(fs.readdirSync(dir)).toEqual([DATA_FILE_NAME])
  })
})

describe('Store', () => {
  const clock = (): Date => new Date('2026-10-21T10:00:00.000Z')

  it('creates, updates, toggles and deletes tasks with persistence', () => {
    const store = new Store(dir, clock)
    expect(store.firstRun).toBe(true)
    const events: string[] = []
    store.onChange((k) => events.push(k))

    const t = store.createTask({ name: '  Write report ', description: 'Q3', dueAt: '2026-10-22T09:00' })
    expect(t).toMatchObject({ name: 'Write report', description: 'Q3', dueAt: '2026-10-22T09:00', completed: false })
    expect(() => store.createTask({ name: '   ' })).toThrow(ValidationError)

    store.updateTask(t.id, { dueAt: '2026-10-23', name: 'Write final report' })
    const toggled = store.toggleTask(t.id)
    expect(toggled.completed).toBe(true)
    expect(toggled.completedAt).toBe('2026-10-21T10:00:00.000Z')
    expect(store.toggleTask(t.id).completedAt).toBeNull()

    const reopened = new Store(dir, clock)
    expect(reopened.firstRun).toBe(false)
    expect(reopened.getTasks()).toEqual([expect.objectContaining({ name: 'Write final report', dueAt: '2026-10-23' })])

    expect(store.deleteTask(t.id)).toBe(true)
    expect(store.deleteTask(t.id)).toBe(false)
    expect(new Store(dir).getTasks()).toEqual([])
    expect(events).toEqual(['tasks', 'tasks', 'tasks', 'tasks', 'tasks'])
  })

  it('manages widgets and settings', () => {
    const store = new Store(dir)
    const w = store.addWidget({ x: 5, y: 6 })
    expect(w).toMatchObject({ x: 5, y: 6, width: WIDGET_DEFAULTS.width, filter: 'all' })
    store.updateWidget(w.id, { filter: 'overdue', opacity: 0.01, locked: true })
    expect(store.getWidget(w.id)).toMatchObject({ filter: 'overdue', opacity: 0.1, locked: true })
    store.setLaunchAtStartup(true)
    const again = new Store(dir)
    expect(again.getSettings().launchAtStartup).toBe(true)
    expect(again.getSettings().widgets).toHaveLength(1)
    expect(again.removeWidget(w.id)).toBe(true)
    expect(new Store(dir).getSettings().widgets).toEqual([])
  })

  it('backs up a file from another schema version before rewriting it', () => {
    const original = JSON.stringify({
      version: SCHEMA_VERSION + 1,
      tasks: [{ id: 'a', name: 'Future', priority: 3, tags: ['x'] }],
      extra: true
    })
    writeRaw(original)
    const store = new Store(dir)
    expect(store.loadInfo.migratedFrom).toBe(SCHEMA_VERSION + 1)
    expect(store.getTasks()).toHaveLength(1)
    expect(fs.readFileSync(store.loadInfo.migrationBackupPath!, 'utf8')).toBe(original)
    expect(readRaw().version).toBe(SCHEMA_VERSION)
  })

  it('rejects invalid due dates and wrongly typed fields instead of silently changing data', () => {
    const store = new Store(dir, clock)
    expect(() => store.createTask({ name: 'x', dueAt: 'garbage' })).toThrow(ValidationError)
    expect(() => store.createTask({ name: 'x', dueAt: '1' })).toThrow(ValidationError)
    expect(store.getTasks()).toEqual([])
    const t = store.createTask({ name: 'x', dueAt: '2026-10-25' })
    expect(() => store.updateTask(t.id, { dueAt: 'garbage' })).toThrow(ValidationError)
    expect(() => store.updateTask(t.id, { completed: 'false' as unknown as boolean })).toThrow(ValidationError)
    expect(() => store.updateTask(t.id, { description: 5 as unknown as string })).toThrow(ValidationError)
    expect(() => store.updateTask(t.id, { name: 'renamed', dueAt: 'bad' })).toThrow(ValidationError)
    expect(store.getTask(t.id)).toMatchObject({ name: 'x', dueAt: '2026-10-25', completed: false })
    expect(store.updateTask(t.id, { description: null as unknown as string }).description).toBe('')
    expect(store.updateTask(t.id, { dueAt: '' }).dueAt).toBeNull()
  })

  it('rolls back in-memory state when saving fails', () => {
    const store = new Store(dir, clock)
    store.createTask({ name: 'kept' })
    const events: string[] = []
    store.onChange((k) => events.push(k))
    // Make the target path a non-empty directory so the atomic rename fails.
    const file = dataFilePath(dir)
    fs.rmSync(file)
    fs.mkdirSync(file)
    fs.writeFileSync(path.join(file, 'blocker'), '')
    expect(() => store.createTask({ name: 'lost' })).toThrow()
    expect(store.getTasks().map((t) => t.name)).toEqual(['kept'])
    expect(events).toEqual([])
  })

  it('tracks notified keys and prunes stale ones', () => {
    const store = new Store(dir)
    const t = store.createTask({ name: 'x', dueAt: '2026-10-21T10:00' })
    store.markNotified([`${t.id}|2026-10-21T10:00`, 'gone|2026-01-01T00:00'])
    expect(store.isNotified(`${t.id}|2026-10-21T10:00`)).toBe(true)
    store.markNotified([])
    expect(store.isNotified('gone|2026-01-01T00:00')).toBe(false)
    expect(new Store(dir).isNotified(`${t.id}|2026-10-21T10:00`)).toBe(true)
  })
})
