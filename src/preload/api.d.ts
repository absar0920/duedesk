import type { DueDeskApi } from '../shared/ipc'

declare global {
  interface Window {
    duedesk: DueDeskApi
  }
}

export {}
