export interface WindowAfterPreload {
	clipboardApi : {
		getClipboardImageDataURI(): string|null;
	},
	restrictedIpcRenderer : {
		send: (channel:string, ...data:any) => void,
		receive: (channel:string, listener: (...args: any[]) => void) => void,
		invoke: (channel:string, listener: (...args: any[]) => void) => void
	}
}