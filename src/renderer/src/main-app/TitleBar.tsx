import { useEffect, useState } from 'react'
import { IconMaximize, IconMinimize, IconRestore, IconX, LogoMark } from '../components/Icons'

const api = window.duedesk

export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    void api.window.isMaximized().then(setMaximized)
    return api.on.maximized(setMaximized)
  }, [])

  return (
    <div className="titlebar" onDoubleClick={() => api.window.toggleMaximize()}>
      <div className="titlebar-brand">
        <LogoMark size={16} />
        <span>DueDesk</span>
      </div>
      <div className="titlebar-controls" onDoubleClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Minimize" onClick={() => api.window.minimize()}>
          <IconMinimize size={14} />
        </button>
        <button type="button" aria-label={maximized ? 'Restore' : 'Maximize'} onClick={() => api.window.toggleMaximize()}>
          {maximized ? <IconRestore size={14} /> : <IconMaximize size={13} />}
        </button>
        <button type="button" className="close" aria-label="Close to tray" title="Close to tray" onClick={() => api.window.close()}>
          <IconX size={14} />
        </button>
      </div>
    </div>
  )
}
