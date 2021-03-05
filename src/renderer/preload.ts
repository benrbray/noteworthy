import { IpcEvents } from "@common/events";
import { RestrictedIpcRenderer } from "@common/ipc";
import {
    contextBridge,
    ipcRenderer
} from "electron";

////////////////////////////////////////////////////////////////////////////////

// TODO: (2021/03/05) This `restrictedIpcRenderer` code was added to allow ipc
// communication when `contextIsolation = true`, as the Electron developers have
// (thankfully) begun to enforce more strict security measures by default.
//
// This bit of code should probably be merged with the IPC proxy objects in 
// ipc.ts, since they accomplish very similar things.  For the time being, they
// remain separate to minimze the number of changes needed to update to the
// newest version of Electron (12.0.0).

// https://github.com/electron/electron/issues/9920#issuecomment-575839738
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
let restrictedIpcRenderer: RestrictedIpcRenderer = {
	send: (channel:string, ...data:any[]) => {
		// whitelist channels
		let validChannels: string[] = ["command"];
		if (validChannels.includes(channel) || channel.startsWith("RENDER_DID_HANDLE")) {
			console.log(`preload :: send() :: channel=${channel} :: ${data}`);
			ipcRenderer.send(channel, ...data);
		} else {
			console.log(`preload :: send() :: invalid channel '${channel}'!`);
		}
	},
	receive: (channel:string, listener: (...args: any[]) => void) => {
		//let validChannels: string[] = [IpcEvents.RENDERER_INVOKE];
		//TODO: (2021/03/05) send message over sub-channel instead of using prefix
		if (channel.startsWith("RENDER_DID_HANDLE") || channel.startsWith(IpcEvents.RENDERER_INVOKE)) {
			console.log(`preload :: attaching listener for channel=${channel}`);
			// deliberately strip event as it includes `sender` 
			ipcRenderer.on(channel, (event, ...args) => {
				console.log(`preload :: received message :: channel=${channel}`);
				listener(...args);
			});
		} else {
			console.log(`preload :: receive() :: invalid channel '${channel}'`);
		}
	},
	invoke: (channel:string, ...data:any[]) => {
		let validChannels: string[] = ["command"];
		if (validChannels.includes(channel)) {
			console.log(`preload :: invoke() :: channel=${channel} :: ${data}`);
			ipcRenderer.invoke(channel, ...data)
		} else {
			console.log(`preload :: invoke() :: invalid channel '${channel}' :: ${data}`);
		}
	}
}

contextBridge.exposeInMainWorld(
    "restrictedIpcRenderer", restrictedIpcRenderer
);