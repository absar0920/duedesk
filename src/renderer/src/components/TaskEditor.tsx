import { useEffect, useRef, useState } from 'react'
import { formatDueLong, localDateString, splitDue, toDueString } from '@shared/dates'
import type { Task, TaskInput } from '@shared/types'
import { IconCalendar, IconTrash, IconX } from './Icons'

export interface TaskEditorProps {
  task: Task | null // null = creating a new task
  onSave: (input: Required<TaskInput>) => Promise<void>
  onDelete?: () => void
  onClose: () => void
}

export function TaskEditor({ task, onSave, onDelete, onClose }: TaskEditorProps): React.JSX.Element {
  const initial = splitDue(task?.dueAt ?? null)
  const [name, setName] = useState(task?.name ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [withTime, setWithTime] = useState(initial.time !== '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  const dueAt = date ? toDueString(date, withTime ? time : null) : null

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Please give the task a name.')
      nameRef.current?.focus()
      return
    }
    if (date && !dueAt) {
      setError('That due date is not valid.')
      return
    }
    if (withTime && date && !time) {
      setError('Pick a time or turn off "Specific time".')
      return
    }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), description, dueAt })
    } catch (err) {
      setError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setSaving(false)
    }
  }

  const quickDate = (offsetDays: number): void => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    setDate(localDateString(d))
    setError(null)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal editor"
        role="dialog"
        aria-modal="true"
        aria-label={task ? 'Edit task' : 'New task'}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit()
        }}
      >
        <header className="modal-head">
          <h2>{task ? 'Edit task' : 'New task'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </header>

        <label className="field">
          <span>Name</span>
          <input
            ref={nameRef}
            value={name}
            maxLength={500}
            placeholder="What needs to be done?"
            aria-invalid={error !== null && !name.trim()}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            value={description}
            rows={5}
            placeholder="Notes, links, details… (optional)"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="field">
          <span>Due date</span>
          <div className="due-row">
            <div className="input-icon">
              <IconCalendar />
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setError(null)
                }}
              />
            </div>
            {withTime && date && (
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Due time" />
            )}
            {date && (
              <button type="button" className="btn ghost sm" onClick={() => setDate('')}>
                Clear
              </button>
            )}
          </div>
          <div className="due-shortcuts">
            <button type="button" className="chip" onClick={() => quickDate(0)}>
              Today
            </button>
            <button type="button" className="chip" onClick={() => quickDate(1)}>
              Tomorrow
            </button>
            <button type="button" className="chip" onClick={() => quickDate(7)}>
              Next week
            </button>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={withTime}
                disabled={!date}
                onChange={(e) => {
                  setWithTime(e.target.checked)
                  if (e.target.checked && !time) setTime('17:00')
                }}
              />
              Specific time
            </label>
          </div>
          <small className="hint">
            {dueAt
              ? `${formatDueLong(dueAt)}${withTime ? '' : ' (end of day)'}`
              : 'No due date — the task will appear under "No due date".'}
          </small>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <footer className="modal-foot">
          {task && onDelete ? (
            <button type="button" className="btn danger ghost" onClick={onDelete}>
              <IconTrash /> Delete
            </button>
          ) : (
            <span className="hint">Ctrl+Enter to save</span>
          )}
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {task ? 'Save' : 'Add task'}
          </button>
        </footer>
      </form>
    </div>
  )
}
