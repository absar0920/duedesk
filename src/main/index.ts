import { app, dialog } from 'electron'
import { IPC } from '../shared/ipc'
import { registerIpc } from './ipc'
import { DueNotifier } from './notifications'
import { Store } from './store'
import { AppTray } from './tray'
import { WindowManager } from './windows'

const APP_ID = 'com.absar0920.duedesk'
const startHidden = process.argv.includes('--hidden')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId(APP_ID)

  let windows: WindowManager | null = null
  let tray: AppTray | null = null
  let notifier: DueNotifier | null = null

  app.on('second-instance', () => windows?.showMain())

  /** Registers/unregisters the Windows login item. Portable builds register the outer exe. */
  const applyLoginItem = (enabled: boolean): void => {
    if (!app.isPackaged) return
    const portableExe = process.env['PORTABLE_EXECUTABLE_FILE']
    app.setLoginItemSettings({
      openAtLogin: enabled,
      args: ['--hidden'],
      ...(portableExe ? { path: portableExe } : {})
    })
  }

  app.whenReady().then(() => {
    let store: Store
    try {
      store = new Store(app.getPath('userData'))
    } catch (err) {
      dialog.showErrorBox('DueDesk', `Could not open the data file:\n${(err as Error).message}`)
      app.exit(1)
      return
    }
    if (store.loadInfo.backupPath) {
      dialog.showErrorBox(
        'DueDesk',
        `The data file was unreadable and has been moved to:\n${store.loadInfo.backupPath}\nDueDesk started with an empty list.`
      )
    }

    const wm = new WindowManager(store)
    windows = wm

    const setLaunchAtStartup = (value: boolean): void => {
      applyLoginItem(value)
      store.setLaunchAtStartup(value)
    }

    store.onChange((kind) => {
      if (kind === 'tasks') {
        wm.broadcast(IPC.evTasks, store.getTasks())
        notifier?.check()
      } else {
        wm.syncWidgets()
        wm.broadcast(IPC.evSettings, store.getSettings())
        tray?.refresh()
      }
    })

    registerIpc({ store, windows: wm, setLaunchAtStartup })

    // First launch: create one widget so the desktop feature is visible immediately.
    if (store.firstRun && store.getSettings().widgets.length === 0) {
      store.addWidget(wm.nextWidgetPosition())
    }

    wm.createMain(!startHidden)
    wm.restoreWidgets()
    applyLoginItem(store.getSettings().launchAtStartup)

    tray = new AppTray({
      openMain: () => wm.showMain(),
      newTask: () => wm.newTask(),
      addWidget: () => wm.addWidget(),
      widgetsVisible: () => wm.areWidgetsVisible(),
      setWidgetsVisible: (v) => wm.setWidgetsVisible(v),
      launchAtStartup: () => store.getSettings().launchAtStartup,
      setLaunchAtStartup,
      quit: () => app.quit()
    })

    wm.onVisibilityChange = () => tray?.refresh()

    notifier = new DueNotifier(store, (id) => wm.openTask(id))
    notifier.start()
  })

  app.on('before-quit', () => {
    windows?.setQuitting()
    notifier?.stop()
  })

  app.on('will-quit', () => {
    tray?.destroy()
    tray = null
  })

  // Closing windows never quits: DueDesk keeps running in the tray until "Quit".
  app.on('window-all-closed', () => {
    /* stay alive in tray */
  })
}
