import { ClipboardApi, RestrictedIpcRenderer } from "../preload/preload";

declare global {
  interface Window {
    clipboardApi: ClipboardApi
    restrictedIpcRenderer: RestrictedIpcRenderer
  }
}
