import { useRef } from 'react'
import { WIDGET_MIN_HEIGHT, WIDGET_MIN_WIDTH } from '@shared/constants'

const api = window.duedesk
const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
type Dir = (typeof DIRS)[number]

/**
 * Custom resize grips. Transparent frameless windows on Windows have no native resize
 * border, so the edges are implemented in the page and the main process applies the bounds.
 */
export function ResizeHandles({ widgetId }: { widgetId: string }): React.JSX.Element {
  const frame = useRef<number | null>(null)

  const onPointerDown = (dir: Dir, e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const start = {
      sx: e.screenX,
      sy: e.screenY,
      x: window.screenX,
      y: window.screenY,
      w: window.outerWidth,
      h: window.outerHeight
    }
    const move = (ev: PointerEvent): void => {
      const dx = ev.screenX - start.sx
      const dy = ev.screenY - start.sy
      let { x, y, w, h } = start
      if (dir.includes('e')) w = Math.max(WIDGET_MIN_WIDTH, start.w + dx)
      if (dir.includes('s')) h = Math.max(WIDGET_MIN_HEIGHT, start.h + dy)
      if (dir.includes('w')) {
        w = Math.max(WIDGET_MIN_WIDTH, start.w - dx)
        x = start.x + start.w - w
      }
      if (dir.includes('n')) {
        h = Math.max(WIDGET_MIN_HEIGHT, start.h - dy)
        y = start.y + start.h - h
      }
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        api.widgets.setBounds(widgetId, { x, y, width: w, height: h })
      })
    }
    const up = (ev: PointerEvent): void => {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <>
      {DIRS.map((d) => (
        <div key={d} className={`resize-handle rh-${d}`} onPointerDown={(e) => onPointerDown(d, e)} />
      ))}
    </>
  )
}
