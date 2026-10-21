import { useEffect, useRef, useState } from 'react'
import { SORTS } from '@shared/constants'
import type { TaskFilter, WidgetConfig, WidgetPatch } from '@shared/types'
import { FilterChips, Toggle } from '../components/common'
import { IconExternal, IconTrash, IconX } from '../components/Icons'

const api = window.duedesk

export function WidgetPanel({
  config,
  counts,
  onChange,
  onClose
}: {
  config: WidgetConfig
  counts: Record<TaskFilter, number>
  onChange: (patch: WidgetPatch) => void
  onClose: () => void
}): React.JSX.Element {
  const [opacity, setOpacity] = useState(config.opacity)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => setOpacity(config.opacity), [config.opacity])

  const changeOpacity = (v: number): void => {
    setOpacity(v)
    document.documentElement.style.setProperty('--w-alpha', String(v))
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onChange({ opacity: v }), 200)
  }

  return (
    <div className="w-panel" role="dialog" aria-label="Widget settings">
      <div className="w-panel-head">
        <strong>Widget settings</strong>
        <button type="button" className="hdr-btn" aria-label="Close settings" onClick={onClose}>
          <IconX size={14} />
        </button>
      </div>

      <div className="w-panel-sec">
        <span className="w-label">Filter</span>
        <FilterChips size="sm" value={config.filter} counts={counts} onChange={(filter) => onChange({ filter })} />
      </div>

      <div className="w-panel-sec">
        <span className="w-label">Sort by</span>
        <div className="segmented">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={config.sort === s.id ? 'active' : ''}
              onClick={() => onChange({ sort: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-panel-sec">
        <span className="w-label">
          Background opacity <em>{Math.round(opacity * 100)}%</em>
        </span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => changeOpacity(Number(e.target.value))}
        />
      </div>

      <div className="w-panel-sec toggles">
        <Toggle label="Show completed" checked={config.showCompleted} onChange={(v) => onChange({ showCompleted: v })} />
        <Toggle label="Always on top" checked={config.alwaysOnTop} onChange={(v) => onChange({ alwaysOnTop: v })} />
        <Toggle
          label="Lock position"
          hint="Disables moving, resizing and editing"
          checked={config.locked}
          onChange={(v) => onChange({ locked: v })}
        />
      </div>

      <div className="w-panel-foot">
        <button type="button" className="mini-btn" onClick={() => api.app.showMain()}>
          <IconExternal size={12} /> Open DueDesk
        </button>
        <div className="spacer" />
        {confirmRemove ? (
          <>
            <button type="button" className="mini-btn" onClick={() => setConfirmRemove(false)}>
              Keep
            </button>
            <button type="button" className="mini-btn danger" onClick={() => void api.widgets.remove(config.id)}>
              Remove
            </button>
          </>
        ) : (
          <button type="button" className="mini-btn danger-ghost" onClick={() => setConfirmRemove(true)}>
            <IconTrash size={12} /> Remove widget
          </button>
        )}
      </div>
    </div>
  )
}
