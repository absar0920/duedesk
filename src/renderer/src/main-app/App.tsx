import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SORTS, filterLabel } from '@shared/constants'
import { countByFilter, GROUP_LABELS, groupOf, listTasks, type TaskGroup } from '@shared/tasks'
import type { Task, TaskFilter, TaskInput, TaskSort } from '@shared/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FilterChips, Toggle } from '../components/common'
import { IconGear, IconPlus, IconSearch, IconWidget, IconX, LogoMark } from '../components/Icons'
import { TaskEditor } from '../components/TaskEditor'
import { useAppData, useDismiss, useNow } from '../hooks'
import { TaskRow } from './TaskRow'
import { TitleBar } from './TitleBar'

const api = window.duedesk
const PREFS_KEY = 'duedesk.main.prefs'

interface Prefs {
  filter: TaskFilter
  sort: TaskSort
  showCompleted: boolean
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { filter: 'all', sort: 'due', showCompleted: false }
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) }
  } catch {
    return fallback
  }
}

type EditorState = { mode: 'new' } | { mode: 'edit'; id: string } | null

const cleanError = (err: unknown): string =>
  (err as Error).message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') ?? String(err)

export function App(): React.JSX.Element {
  const { tasks, settings, loaded } = useAppData()
  const now = useNow()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<EditorState>(null)
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [widgetsVisible, setWidgetsVisible] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useDismiss(menuRef, menuOpen, useCallback(() => setMenuOpen(false), []))

  const updatePrefs = (patch: Partial<Prefs>): void => {
    setPrefs((p) => {
      const next = { ...p, ...patch }
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable: keep in memory */
      }
      return next
    })
  }

  const showError = useCallback((err: unknown) => {
    setToast(cleanError(err))
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    void api.widgets.isVisible().then(setWidgetsVisible)
    const offs = [
      api.on.editTask((id) => setEditor({ mode: 'edit', id })),
      api.on.newTask(() => setEditor({ mode: 'new' })),
      api.on.widgetsVisible(setWidgetsVisible)
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || editor || confirmDelete) return
      const k = e.key.toLowerCase()
      if (k === 'n') {
        e.preventDefault()
        setEditor({ mode: 'new' })
      } else if (k === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, confirmDelete])

  const visible = useMemo(
    () => listTasks(tasks, { ...prefs, search }, now),
    [tasks, prefs, search, now]
  )
  const counts = useMemo(() => countByFilter(tasks, now), [tasks, now])
  const openCount = tasks.filter((t) => !t.completed).length

  // Section headers only make sense when sorting by due date.
  const sections = useMemo(() => {
    if (prefs.sort !== 'due') return [{ group: null as TaskGroup | null, items: visible }]
    const out: { group: TaskGroup | null; items: Task[] }[] = []
    for (const t of visible) {
      const g = groupOf(t, now)
      const last = out[out.length - 1]
      if (last && last.group === g) last.items.push(t)
      else out.push({ group: g, items: [t] })
    }
    return out
  }, [visible, prefs.sort, now])

  const editingTask = editor?.mode === 'edit' ? (tasks.find((t) => t.id === editor.id) ?? null) : null
  useEffect(() => {
    // Task deleted elsewhere (e.g. from a widget) while open in the editor.
    if (loaded && editor?.mode === 'edit' && !editingTask) setEditor(null)
  }, [loaded, editor, editingTask])

  const saveTask = async (input: Required<TaskInput>): Promise<void> => {
    if (editor?.mode === 'edit') await api.tasks.update(editor.id, input)
    else await api.tasks.create(input)
    setEditor(null)
  }

  const toggle = (t: Task): void => void api.tasks.toggle(t.id).catch(showError)
  const doDelete = (t: Task): void => {
    setConfirmDelete(null)
    setEditor(null)
    void api.tasks.remove(t.id).catch(showError)
  }

  const emptyText = search
    ? `No tasks match "${search}".`
    : prefs.filter === 'all'
      ? 'Nothing to do. Add a task to get started.'
      : `No ${prefs.showCompleted ? '' : 'open '}tasks in "${filterLabel(prefs.filter)}".`

  return (
    <div className="app">
      <TitleBar />
      <main className="content">
        <header className="page-head">
          <div className="page-title">
            <h1>Tasks</h1>
            <span className="dim">{openCount === 1 ? '1 open' : `${openCount} open`}</span>
          </div>
          <div className="page-actions">
            <button type="button" className="btn ghost" onClick={() => void api.widgets.add().catch(showError)}>
              <IconWidget /> Add widget
            </button>
            <div className="menu-anchor" ref={menuRef}>
              <button
                type="button"
                className={`icon-btn lg${menuOpen ? ' active' : ''}`}
                aria-label="Settings"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <IconGear size={18} />
              </button>
              {menuOpen && settings && (
                <div className="popover settings-pop">
                  <h3>Settings</h3>
                  <Toggle
                    label="Launch at startup"
                    hint="Start DueDesk in the tray when Windows starts"
                    checked={settings.launchAtStartup}
                    onChange={(v) => void api.settings.setLaunchAtStartup(v).catch(showError)}
                  />
                  <Toggle
                    label="Show desktop widgets"
                    hint={`${settings.widgets.length} widget${settings.widgets.length === 1 ? '' : 's'}`}
                    checked={widgetsVisible}
                    onChange={(v) => void api.widgets.setVisible(v).then(setWidgetsVisible)}
                  />
                  <p className="pop-foot">
                    <LogoMark size={12} /> DueDesk keeps everything on this PC. No account, no sync.
                  </p>
                </div>
              )}
            </div>
            <button type="button" className="btn primary" onClick={() => setEditor({ mode: 'new' })} title="New task (Ctrl+N)">
              <IconPlus /> New task
            </button>
          </div>
        </header>

        <div className="toolbar">
          <div className="search">
            <IconSearch />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search tasks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
            />
            {search && (
              <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setSearch('')}>
                <IconX size={14} />
              </button>
            )}
          </div>
          <FilterChips value={prefs.filter} onChange={(filter) => updatePrefs({ filter })} counts={counts} />
          <div className="toolbar-right">
            <label className="select">
              <span>Sort</span>
              <select value={prefs.sort} onChange={(e) => updatePrefs({ sort: e.target.value as TaskSort })}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={prefs.showCompleted}
                onChange={(e) => updatePrefs({ showCompleted: e.target.checked })}
              />
              Show completed
            </label>
          </div>
        </div>

        <section className="panel list-panel">
          {!loaded ? null : visible.length === 0 ? (
            <div className="empty">
              <p>{emptyText}</p>
              {!search && (
                <button type="button" className="btn primary" onClick={() => setEditor({ mode: 'new' })}>
                  <IconPlus /> New task
                </button>
              )}
            </div>
          ) : (
            sections.map((s, i) => (
              <div key={s.group ?? i} className="section">
                {s.group && (
                  <h4 className={`section-head tone-${s.group === 'completed' ? 'done' : s.group}`}>
                    {GROUP_LABELS[s.group]} <span>{s.items.length}</span>
                  </h4>
                )}
                <ul className="task-list">
                  {s.items.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      now={now}
                      onToggle={() => toggle(t)}
                      onEdit={() => setEditor({ mode: 'edit', id: t.id })}
                      onDelete={() => setConfirmDelete(t)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </main>

      {editor && (editor.mode === 'new' || editingTask) && (
        <TaskEditor
          key={editor.mode === 'edit' ? editor.id : 'new'}
          task={editingTask}
          onSave={saveTask}
          onDelete={editingTask ? () => setConfirmDelete(editingTask) : undefined}
          onClose={() => setEditor(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete task"
          message={`Delete "${confirmDelete.name}"? This cannot be undone.`}
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
