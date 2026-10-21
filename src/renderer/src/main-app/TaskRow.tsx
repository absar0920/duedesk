import { countdownLabel, formatDueLong } from '@shared/dates'
import type { Task } from '@shared/types'
import { DueDot, dueClassOf } from '../components/common'
import { IconCheck, IconPencil, IconTrash } from '../components/Icons'

export function TaskRow({
  task,
  now,
  onToggle,
  onEdit,
  onDelete
}: {
  task: Task
  now: Date
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  const tone = dueClassOf(task, now)
  const firstLine = task.description.split('\n').find((l) => l.trim()) ?? ''
  return (
    <li className={`task-row tone-${tone}${task.completed ? ' completed' : ''}`}>
      <button
        type="button"
        className={`checkbox${task.completed ? ' checked' : ''}`}
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? `Mark "${task.name}" as not done` : `Complete "${task.name}"`}
        onClick={onToggle}
      >
        {task.completed && <IconCheck size={12} strokeWidth={3} />}
      </button>
      <button type="button" className="task-main" onClick={onEdit} title="Edit task">
        <span className="task-title">
          <DueDot tone={tone} />
          <span className="task-name">{task.name}</span>
        </span>
        {firstLine && <span className="task-desc">{firstLine}</span>}
      </button>
      <span className={`countdown tone-${tone}`} title={formatDueLong(task.dueAt)}>
        {task.dueAt ? countdownLabel(task.dueAt, now) : ''}
      </span>
      <span className="row-actions">
        <button type="button" className="icon-btn" aria-label="Edit" title="Edit" onClick={onEdit}>
          <IconPencil size={15} />
        </button>
        <button type="button" className="icon-btn danger" aria-label="Delete" title="Delete" onClick={onDelete}>
          <IconTrash size={15} />
        </button>
      </span>
    </li>
  )
}
