import { IpcRenderer } from "electron";

export type FunctionPropertyNames<T> = { [K in keyof T]: K extends string ? (T[K] extends Function ? K : never) : never }[keyof T];

// here is an attempt at type-safe ipc with the main process
// it's not bullet-proof, but it's better than shuffling strings
export function invokerFor<T extends object>(ipc: IpcRenderer, channel:string="command"): T {
	return new Proxy({ ipc }, {
		get(target, prop: FunctionPropertyNames<T>, receiver: any) {
			return async (data: any) => {
				console.log(`RenderIPC :: send event :: ${prop}`)
				return target.ipc.invoke(channel, prop, data);
			}
		}
	});
}

type Listener<E> = (event:E, ...args:any[]) => void;
type OnFunc<E,R=void> = (channel:string, listener:Listener<E>) => R;
type SendFunc = (channel:string, ...args:any[]) => void;
type Sender<E extends Electron.Event> = { 
	send:SendFunc
};

// here is an attempt at type-safe ipc with the main process
// it's not bullet-proof, but it's better than shuffling strings
export function senderFor<T extends object, E extends Electron.Event = Electron.Event>(ee: Sender<E>, channel:string="command"): T {
	return new Proxy({ee}, {
		get(target, prop: FunctionPropertyNames<T>, receiver: any) {
			return async (data: any) => {
				console.log(`RenderIPC :: send event :: ${prop}`)
				target.ee.send(channel, prop, data)
			}
		}
	});
}