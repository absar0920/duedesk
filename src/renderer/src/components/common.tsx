import { FILTERS } from '@shared/constants'
import { classifyDue, type DueClass } from '@shared/dates'
import type { Task, TaskFilter } from '@shared/types'

export function dueClassOf(task: Task, now: Date): DueClass | 'done' {
  return task.completed ? 'done' : classifyDue(task.dueAt, now)
}

export function DueDot({ tone }: { tone: DueClass | 'done' }): React.JSX.Element {
  return <span className={`due-dot tone-${tone}`} aria-hidden="true" />
}

export function FilterChips({
  value,
  onChange,
  counts,
  size = 'md'
}: {
  value: TaskFilter
  onChange: (f: TaskFilter) => void
  counts?: Record<TaskFilter, number>
  size?: 'sm' | 'md'
}): React.JSX.Element {
  return (
    <div className={`chips chips-${size}`} role="tablist" aria-label="Filter tasks">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={value === f.id}
          className={`chip${value === f.id ? ' active' : ''}${f.id === 'overdue' && counts && counts.overdue > 0 ? ' alert' : ''}`}
          onClick={() => onChange(f.id)}
        >
          {f.label}
          {counts && counts[f.id] > 0 && <span className="chip-count">{counts[f.id]}</span>}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}): React.JSX.Element {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  )
}
