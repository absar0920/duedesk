import { countdownLabel, formatDueLong } from '@shared/dates'
import type { Task } from '@shared/types'
import { DueDot, dueClassOf } from '../components/common'
import { IconCheck, IconExternal, IconPencil, IconX } from '../components/Icons'

const api = window.duedesk

export function WidgetRow({
  task,
  now,
  locked,
  expanded,
  onExpand
}: {
  task: Task
  now: Date
  locked: boolean
  expanded: boolean
  onExpand: () => void
}): React.JSX.Element {
  const tone = dueClassOf(task, now)
  return (
    <li className={`w-row${task.completed ? ' completed' : ''}${expanded ? ' expanded' : ''}`}>
      <div className="w-row-main">
        <DueDot tone={tone} />
        <button type="button" className="w-row-text" onClick={onExpand} aria-expanded={expanded}>
          <span className="w-name">{task.name}</span>
          {task.dueAt && <span className={`w-due tone-${tone}`}>{countdownLabel(task.dueAt, now)}</span>}
        </button>
        <span className="w-actions">
          <button
            type="button"
            className="round-btn green"
            title={task.completed ? 'Mark as not done' : 'Complete'}
            aria-label={task.completed ? 'Mark as not done' : 'Complete'}
            onClick={() => void api.tasks.toggle(task.id)}
          >
            <IconCheck size={11} strokeWidth={3} />
          </button>
          {!locked && (
            <>
              <button
                type="button"
                className="round-btn blue"
                title="Edit in DueDesk"
                aria-label="Edit"
                onClick={() => api.app.openTask(task.id)}
              >
                <IconPencil size={10} strokeWidth={2.6} />
              </button>
              <button
                type="button"
                className="round-btn red"
                title="Delete"
                aria-label="Delete"
                onClick={() => void api.tasks.confirmRemove(task.id)}
              >
                <IconX size={10} strokeWidth={3} />
              </button>
            </>
          )}
        </span>
      </div>
      {expanded && (
        <div className="w-details">
          <div className="w-details-due">{formatDueLong(task.dueAt)}</div>
          {task.description ? <p className="w-desc">{task.description}</p> : <p className="w-desc dim">No description</p>}
          <button type="button" className="w-link" onClick={() => api.app.openTask(task.id)}>
            <IconExternal size={12} /> Open in DueDesk
          </button>
        </div>
      )}
    </li>
  )
}
