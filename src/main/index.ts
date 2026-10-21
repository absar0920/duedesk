import fs from 'node:fs'
import path from 'node:path'
import { app, dialog, shell } from 'electron'
import { SCHEMA_VERSION } from '../shared/constants'
import { IPC } from '../shared/ipc'
import { registerIpc } from './ipc'
import { DueNotifier } from './notifications'
import { Store } from './store'
import { AppTray } from './tray'
import { WindowManager } from './windows'

const APP_ID = 'com.absar0920.duedesk'
const startHidden = process.argv.includes('--hidden')

/**
 * Windows only shows toasts for a Win32 app whose AppUserModelID is registered through a Start
 * Menu shortcut. The NSIS installer creates one; the portable exe does not, so register it here.
 */
function registerPortableAumid(): void {
  const portableExe = process.env['PORTABLE_EXECUTABLE_FILE']
  if (process.platform !== 'win32' || !app.isPackaged || !portableExe) return
  try {
    const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'DueDesk.lnk')
    if (fs.existsSync(lnk)) {
      try {
        const cur = shell.readShortcutLink(lnk)
        // Any working shortcut with our AUMID (installer-made or an earlier portable run) is enough;
        // rewrite only when it is missing the id or points to an exe that was moved or deleted.
        if (cur.appUserModelId === APP_ID && fs.existsSync(cur.target)) return
      } catch {
        /* unreadable shortcut: rewrite it */
      }
    }
    shell.writeShortcutLink(lnk, 'create', {
      target: portableExe,
      appUserModelId: APP_ID,
      description: 'DueDesk (portable)',
      icon: portableExe,
      iconIndex: 0
    })
  } catch {
    /* notifications just won't show; nothing else depends on this */
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId(APP_ID)
  registerPortableAumid()

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
    const { migratedFrom, migrationBackupPath } = store.loadInfo
    if (migratedFrom !== undefined && migratedFrom > SCHEMA_VERSION && migrationBackupPath) {
      dialog.showErrorBox(
        'DueDesk',
        `The data file was written by a newer version of DueDesk. Fields this version does not know about were dropped.\nThe original file was kept at:\n${migrationBackupPath}`
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
