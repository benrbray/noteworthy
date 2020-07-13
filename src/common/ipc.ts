// Here is an attempt at type-safe ipc between render/main!
// It's not bullet-proof, but it's better than shuffling strings around!
//
// related links:
//    1. https://github.com/electron/electron/pull/18449
//    2. https://github.com/electron/electron/pull/4522
//    3. https://github.com/electron/electron/issues/3642
//    4. https://stackoverflow.com/questions/47597982/send-sync-message-from-ipcmain-to-ipcrenderer-electron

/* -- Types --------------------------------------------- */

export type FunctionPropertyNames<T> = { [K in keyof T]: K extends string ? (T[K] extends Function ? K : never) : never }[keyof T];

interface Sendable<E extends Electron.Event> {
	send:(channel: string, ...args: any[]) => void;
};
interface Invokable {
	invoke: (channel: string, ...args: any[]) => void;
};

/* -- Invoker ------------------------------------------- */

/**
 * Creates a Proxy which redirects any methods (of type T)
 * through the invoke() function of the given invokable 
 * argument, allowing for type-checked ipc events!
 */
export function invokerFor<T extends object>(ipc: Invokable, channel:string="command", logPrefix?:string): T {
	return new Proxy({ ipc }, {
		get(target, prop: FunctionPropertyNames<T>, receiver: any) {
			return async (data: any) => {
				if(logPrefix!==undefined){ console.log(`${logPrefix} :: invoke event :: ${prop}`) }
				return target.ipc.invoke(channel, prop, data);
			}
		}
	});
}

/* -- Sender -------------------------------------------- */

/**
 * @deprecated in favor of `invokerFor` above, since `senderFor`
 *    cannot actually return a result! send() returns immediately,
 *    without waiting for the event to be handled.
 */
export function senderFor<T extends object, E extends Electron.Event = Electron.Event>(ee: Sendable<E>, channel:string="command", logPrefix?:string): T {
	return new Proxy({ee}, {
		get(target, prop: FunctionPropertyNames<T>, receiver: any) {
			return (data: any) => {
				if (logPrefix !== undefined) { console.log(`${logPrefix} :: send event :: ${prop}`) }
				target.ee.send(channel, prop, data)
				let x:string = prop;
			}
		}
	});
}