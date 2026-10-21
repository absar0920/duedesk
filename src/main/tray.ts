import { Menu, Tray, nativeImage } from 'electron'
import { iconPath } from './paths'

export interface TrayActions {
  openMain(): void
  newTask(): void
  addWidget(): void
  widgetsVisible(): boolean
  setWidgetsVisible(visible: boolean): void
  launchAtStartup(): boolean
  setLaunchAtStartup(value: boolean): void
  quit(): void
}

export class AppTray {
  private tray: Tray

  constructor(private readonly actions: TrayActions) {
    const icon = nativeImage.createFromPath(iconPath(process.platform === 'win32' ? 'ico' : 'png'))
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }))
    this.tray.setToolTip('DueDesk')
    this.tray.on('click', () => this.actions.openMain())
    this.tray.on('double-click', () => this.actions.openMain())
    this.refresh()
  }

  refresh(): void {
    const a = this.actions
    const visible = a.widgetsVisible()
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open DueDesk', click: () => a.openMain() },
        { label: 'New task', click: () => a.newTask() },
        { type: 'separator' },
        { label: 'Add widget', click: () => a.addWidget() },
        { label: visible ? 'Hide widgets' : 'Show widgets', click: () => a.setWidgetsVisible(!visible) },
        { type: 'separator' },
        {
          label: 'Launch at startup',
          type: 'checkbox',
          checked: a.launchAtStartup(),
          click: (item) => a.setLaunchAtStartup(item.checked)
        },
        { type: 'separator' },
        { label: 'Quit', click: () => a.quit() }
      ])
    )
  }

  destroy(): void {
    this.tray.destroy()
  }
}
