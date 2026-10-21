import { app } from 'electron'
import path from 'node:path'

/** Directory holding runtime resources (icons). Packaged: copied via electron-builder extraResources. */
export function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources')
}

export function iconPath(kind: 'png' | 'ico' = 'png'): string {
  return path.join(resourcesDir(), `icon.${kind}`)
}

export function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

/** Loads one of the renderer pages, using the Vite dev server when running `electron-vite dev`. */
export function rendererTarget(page: 'index' | 'widget', query: Record<string, string> = {}):
  | { url: string }
  | { file: string; query: Record<string, string> } {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    const qs = new URLSearchParams(query).toString()
    return { url: `${devUrl}/${page}.html${qs ? `?${qs}` : ''}` }
  }
  return { file: path.join(__dirname, `../renderer/${page}.html`), query }
}
