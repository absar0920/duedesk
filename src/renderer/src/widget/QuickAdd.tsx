import { useEffect, useRef, useState } from 'react'
import { localDateString, toDueString } from '@shared/dates'

const api = window.duedesk

export function QuickAdd({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const submit = async (keepOpen: boolean): Promise<void> => {
    if (!name.trim()) {
      setError(true)
      inputRef.current?.focus()
      return
    }
    await api.tasks.create({ name: name.trim(), dueAt: toDueString(date) })
    setName('')
    if (!keepOpen) onDone()
    else inputRef.current?.focus()
  }

  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault()
        void submit(true)
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
    >
      <input
        ref={inputRef}
        className={error ? 'invalid' : ''}
        value={name}
        maxLength={500}
        placeholder="New task, press Enter"
        onChange={(e) => {
          setName(e.target.value)
          setError(false)
        }}
      />
      <div className="quick-add-row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date (optional)" />
        <button type="button" className="mini-chip" onClick={() => setDate(localDateString(new Date()))}>
          Today
        </button>
        <button
          type="button"
          className="mini-chip"
          onClick={() => {
            const d = new Date()
            d.setDate(d.getDate() + 1)
            setDate(localDateString(d))
          }}
        >
          Tmrw
        </button>
        <div className="spacer" />
        <button type="button" className="mini-btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="mini-btn primary">
          Add
        </button>
      </div>
    </form>
  )
}
