import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FILTERS, filterLabel } from '@shared/constants'
import { countByFilter, listTasks } from '@shared/tasks'
import type { WidgetPatch } from '@shared/types'
import { IconChevronDown, IconLock, IconPin, IconPlus, IconSliders, IconUnlock } from '../components/Icons'
import { useAppData, useDismiss, useNow } from '../hooks'
import { QuickAdd } from './QuickAdd'
import { ResizeHandles } from './ResizeHandles'
import { WidgetPanel } from './WidgetPanel'
import { WidgetRow } from './WidgetRow'

const api = window.duedesk

export function WidgetApp({ widgetId }: { widgetId: string }): React.JSX.Element | null {
  const { tasks, settings } = useAppData()
  const now = useNow()
  const [adding, setAdding] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [filterMenu, setFilterMenu] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  useDismiss(filterRef, filterMenu, useCallback(() => setFilterMenu(false), []))

  const config = settings?.widgets.find((w) => w.id === widgetId) ?? null

  const opacity = config?.opacity
  const isLocked = config?.locked ?? false
  useEffect(() => {
    if (opacity !== undefined) document.documentElement.style.setProperty('--w-alpha', String(opacity))
  }, [opacity])
  useEffect(() => {
    if (isLocked) setAdding(false)
  }, [isLocked])

  const visible = useMemo(
    () => (config ? listTasks(tasks, { filter: config.filter, sort: config.sort, showCompleted: config.showCompleted }, now) : []),
    [tasks, config, now]
  )
  const counts = useMemo(() => countByFilter(tasks, now), [tasks, now])

  if (!config) return null

  const update = (patch: WidgetPatch): void => void api.widgets.update(widgetId, patch)
  const locked = config.locked

  return (
    <div className={`widget${locked ? ' locked' : ''}`}>
      <header className="w-header">
        <div className="w-title">
          <h1>Tasks</h1>
          <div className="w-filter" ref={filterRef}>
            <button
              type="button"
              className="w-filter-btn"
              aria-haspopup="listbox"
              aria-expanded={filterMenu}
              onClick={() => setFilterMenu((o) => !o)}
            >
              {filterLabel(config.filter)}
              <IconChevronDown size={12} />
            </button>
            {filterMenu && (
              <ul className="w-menu" role="listbox">
                {FILTERS.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={config.filter === f.id}
                      className={config.filter === f.id ? 'active' : ''}
                      onClick={() => {
                        update({ filter: f.id })
                        setFilterMenu(false)
                      }}
                    >
                      <span>{f.label}</span>
                      {counts[f.id] > 0 && <em className={f.id === 'overdue' ? 'alert' : ''}>{counts[f.id]}</em>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="w-tools">
          {config.alwaysOnTop && (
            <span className="hdr-flag" title="Always on top">
              <IconPin size={13} />
            </span>
          )}
          <button
            type="button"
            className={`hdr-btn${locked ? ' on' : ''}`}
            title={locked ? 'Unlock widget' : 'Lock widget'}
            aria-label={locked ? 'Unlock widget' : 'Lock widget'}
            onClick={() => update({ locked: !locked })}
          >
            {locked ? <IconLock size={16} /> : <IconUnlock size={16} />}
          </button>
          <button
            type="button"
            className={`hdr-btn${panelOpen ? ' on' : ''}`}
            title="Widget settings"
            aria-label="Widget settings"
            onClick={() => setPanelOpen((o) => !o)}
          >
            <IconSliders size={16} />
          </button>
          {!locked && (
            <button
              type="button"
              className={`hdr-btn${adding ? ' on' : ''}`}
              title="Quick add"
              aria-label="Quick add task"
              onClick={() => setAdding((a) => !a)}
            >
              <IconPlus size={17} />
            </button>
          )}
        </div>
      </header>

      {adding && !locked && <QuickAdd onDone={() => setAdding(false)} />}

      <div className="w-body">
        {visible.length === 0 ? (
          <p className="w-empty">
            {tasks.length === 0 ? 'No tasks yet. Click + to add one.' : `Nothing in "${filterLabel(config.filter)}".`}
          </p>
        ) : (
          <ul className="w-list">
            {visible.map((t) => (
              <WidgetRow
                key={t.id}
                task={t}
                now={now}
                locked={locked}
                expanded={expanded === t.id}
                onExpand={() => setExpanded((cur) => (cur === t.id ? null : t.id))}
              />
            ))}
          </ul>
        )}
      </div>

      {panelOpen && (
        <WidgetPanel config={config} counts={counts} onChange={update} onClose={() => setPanelOpen(false)} />
      )}
      {!locked && <ResizeHandles widgetId={widgetId} />}
    </div>
  )
}
