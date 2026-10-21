import { BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { WIDGET_DEFAULTS, WIDGET_MIN_HEIGHT, WIDGET_MIN_WIDTH } from '../shared/constants'
import { IPC } from '../shared/ipc'
import type { Bounds, WidgetConfig } from '../shared/types'
import { iconPath, preloadPath, rendererTarget } from './paths'
import type { Store } from './store'

const BOUNDS_SAVE_DELAY = 400

function load(win: BrowserWindow, page: 'index' | 'widget', query: Record<string, string> = {}): void {
  const target = rendererTarget(page, query)
  if ('url' in target) void win.loadURL(target.url)
  else void win.loadFile(target.file, { query: target.query })
}

function hardenWebContents(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
}

function intersects(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export class WindowManager {
  main: BrowserWindow | null = null
  private widgets = new Map<string, BrowserWindow>()
  private boundsTimers = new Map<string, NodeJS.Timeout>()
  private widgetsVisible = true
  private quitting = false
  private pendingMainEvents: Array<[string, ...unknown[]]> = []
  /** Called whenever widgets are shown/hidden (e.g. to refresh the tray menu). */
  onVisibilityChange: (() => void) | null = null

  constructor(private readonly store: Store) {}

  /** Marks the app as quitting and writes any not-yet-saved widget bounds. */
  setQuitting(): void {
    if (this.quitting) return
    this.quitting = true
    for (const [id, t] of this.boundsTimers) {
      clearTimeout(t)
      const win = this.widgets.get(id)
      if (win && !win.isDestroyed() && this.store.getWidget(id)) {
        try {
          this.store.updateWidget(id, win.getBounds())
        } catch {
          /* best effort while shutting down */
        }
      }
    }
    this.boundsTimers.clear()
  }

  /**
   * before-quit is not emitted on Windows when the session ends (shutdown, restart, logoff),
   * so treat the session ending as a quit; otherwise hide-to-tray would block the close.
   */
  private quitOnSessionEnd(win: BrowserWindow): void {
    win.on('query-session-end', () => this.setQuitting())
    win.on('session-end', () => this.setQuitting())
  }

  // ---------------------------------------------------------------- main window

  createMain(show: boolean): BrowserWindow {
    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 640,
      minHeight: 460,
      show: false,
      frame: false,
      backgroundColor: '#15172b',
      title: 'DueDesk',
      icon: iconPath(process.platform === 'win32' ? 'ico' : 'png'),
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    hardenWebContents(win)
    this.quitOnSessionEnd(win)
    win.on('close', (e) => {
      if (!this.quitting) {
        e.preventDefault()
        win.hide()
      }
    })
    win.on('closed', () => {
      this.main = null
    })
    const sendMax = (): void => win.webContents.send(IPC.evMaximized, win.isMaximized())
    win.on('maximize', sendMax)
    win.on('unmaximize', sendMax)
    win.once('ready-to-show', () => {
      if (show) win.show()
    })
    win.webContents.on('did-finish-load', () => {
      const queued = this.pendingMainEvents
      this.pendingMainEvents = []
      for (const [channel, ...args] of queued) win.webContents.send(channel, ...args)
    })
    load(win, 'index')
    this.main = win
    return win
  }

  showMain(): void {
    const win = this.main ?? this.createMain(true)
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  /** Sends an event to the main window, queueing it until the page has loaded. */
  private sendToMain(channel: string, ...args: unknown[]): void {
    const win = this.main ?? this.createMain(true)
    if (win.webContents.isLoading()) this.pendingMainEvents.push([channel, ...args])
    else win.webContents.send(channel, ...args)
  }

  openTask(id: string): void {
    this.showMain()
    this.sendToMain(IPC.evEditTask, id)
  }

  newTask(): void {
    this.showMain()
    this.sendToMain(IPC.evNewTask)
  }

  // ---------------------------------------------------------------- widgets

  /** Creates windows for every saved widget (called at startup). */
  restoreWidgets(): void {
    this.syncWidgets()
  }

  /** Default spot for a new widget: top-right of the primary work area, cascading. */
  nextWidgetPosition(): { x: number; y: number } {
    const wa = screen.getPrimaryDisplay().workArea
    const offset = (this.store.getSettings().widgets.length % 6) * 32
    return {
      x: Math.round(wa.x + wa.width - WIDGET_DEFAULTS.width - 40 - offset),
      y: Math.round(wa.y + 40 + offset)
    }
  }

  addWidget(): WidgetConfig {
    // The window itself is created by syncWidgets(), which runs on every settings change.
    const cfg = this.store.addWidget(this.nextWidgetPosition())
    if (!this.widgetsVisible) this.setWidgetsVisible(true)
    return cfg
  }

  /** Makes sure a stored rectangle is still reachable on some display (monitors may have changed). */
  private visibleBounds(cfg: WidgetConfig): Bounds {
    const b = { x: cfg.x, y: cfg.y, width: cfg.width, height: cfg.height }
    const header = { x: b.x + 20, y: b.y, width: Math.max(1, b.width - 40), height: 36 }
    const ok = screen.getAllDisplays().some((d) => intersects(header, d.workArea))
    if (ok) return b
    const wa = screen.getPrimaryDisplay().workArea
    return {
      x: wa.x + wa.width - b.width - 40,
      y: wa.y + 40,
      width: Math.min(b.width, wa.width),
      height: Math.min(b.height, wa.height)
    }
  }

  private createWidgetWindow(cfg: WidgetConfig): BrowserWindow {
    const b = this.visibleBounds(cfg)
    const win = new BrowserWindow({
      ...b,
      minWidth: WIDGET_MIN_WIDTH,
      minHeight: WIDGET_MIN_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      skipTaskbar: true,
      resizable: !cfg.locked,
      movable: !cfg.locked,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: cfg.alwaysOnTop,
      title: 'DueDesk widget',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    })
    hardenWebContents(win)
    const id = cfg.id
    win.once('ready-to-show', () => {
      // showInactive: restoring widgets must not steal focus from whatever the user is doing.
      if (this.widgetsVisible) win.showInactive()
    })
    const scheduleSave = (): void => this.scheduleBoundsSave(id, win)
    win.on('moved', scheduleSave)
    win.on('resized', scheduleSave)
    win.on('move', scheduleSave)
    win.on('resize', scheduleSave)
    this.quitOnSessionEnd(win)
    win.on('close', (e) => {
      // Alt+F4 / system-menu Close on a widget does nothing: removal goes through "Remove widget"
      // and hiding through the tray's Show/Hide widgets toggle, so the two never get out of sync.
      if (!this.quitting && this.widgets.get(id) === win && this.store.getWidget(id)) {
        e.preventDefault()
      }
    })
    win.on('closed', () => {
      if (this.widgets.get(id) === win) this.widgets.delete(id)
      const t = this.boundsTimers.get(id)
      if (t) clearTimeout(t)
      this.boundsTimers.delete(id)
    })
    load(win, 'widget', { id })
    this.widgets.set(id, win)
    return win
  }

  private scheduleBoundsSave(id: string, win: BrowserWindow): void {
    const prev = this.boundsTimers.get(id)
    if (prev) clearTimeout(prev)
    this.boundsTimers.set(
      id,
      setTimeout(() => {
        this.boundsTimers.delete(id)
        if (win.isDestroyed() || !this.store.getWidget(id)) return
        const { x, y, width, height } = win.getBounds()
        const cur = this.store.getWidget(id)!
        if (cur.x === x && cur.y === y && cur.width === width && cur.height === height) return
        this.store.updateWidget(id, { x, y, width, height })
      }, BOUNDS_SAVE_DELAY)
    )
  }

  /** Programmatic move/resize requested by a widget's custom resize handles. */
  setWidgetBounds(id: string, bounds: Bounds): void {
    const win = this.widgets.get(id)
    const cfg = this.store.getWidget(id)
    if (!win || win.isDestroyed() || !cfg || cfg.locked) return
    const next = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(WIDGET_MIN_WIDTH, Math.round(bounds.width)),
      height: Math.max(WIDGET_MIN_HEIGHT, Math.round(bounds.height))
    }
    if (![next.x, next.y, next.width, next.height].every(Number.isFinite)) return
    win.setBounds(next)
    this.scheduleBoundsSave(id, win)
  }

  /** Reconciles open widget windows with the stored widget configs. */
  syncWidgets(): void {
    const configs = this.store.getSettings().widgets
    const ids = new Set(configs.map((c) => c.id))
    for (const [id, win] of this.widgets) {
      if (!ids.has(id)) {
        this.widgets.delete(id)
        if (!win.isDestroyed()) win.destroy()
      }
    }
    for (const cfg of configs) {
      const win = this.widgets.get(cfg.id)
      if (!win || win.isDestroyed()) {
        this.createWidgetWindow(cfg)
        continue
      }
      if (win.isAlwaysOnTop() !== cfg.alwaysOnTop) win.setAlwaysOnTop(cfg.alwaysOnTop)
      if (win.isMovable() === cfg.locked) win.setMovable(!cfg.locked)
      if (win.isResizable() === cfg.locked) win.setResizable(!cfg.locked)
    }
  }

  removeWidget(id: string): boolean {
    return this.store.removeWidget(id) // syncWidgets runs on the settings change
  }

  areWidgetsVisible(): boolean {
    return this.widgetsVisible
  }

  setWidgetsVisible(visible: boolean): void {
    this.widgetsVisible = visible
    for (const win of this.widgets.values()) {
      if (win.isDestroyed()) continue
      if (visible) win.showInactive()
      else win.hide()
    }
    this.broadcast(IPC.evWidgetsVisible, visible)
    this.onVisibilityChange?.()
  }

  // ---------------------------------------------------------------- messaging

  allWindows(): BrowserWindow[] {
    const list = [...this.widgets.values()]
    if (this.main) list.push(this.main)
    return list.filter((w) => !w.isDestroyed())
  }

  broadcast(channel: string, ...args: unknown[]): void {
    for (const w of this.allWindows()) w.webContents.send(channel, ...args)
  }
}
