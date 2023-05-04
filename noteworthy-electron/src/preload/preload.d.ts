import { ClipboardApi } from "./preload";

declare global {
  interface Window {
    clipboardApi: ClipboardApi
    restrictedIpcRenderer: RestrictedIpcRenderer
  }
}
