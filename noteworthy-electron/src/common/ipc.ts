// Here is an attempt at type-safe ipc between render/main!
// It's not bullet-proof, but it's better than shuffling strings around!
//
// related links:
//    1. https://github.com/electron/electron/pull/18449
//    2. https://github.com/electron/electron/pull/4522
//    3. https://github.com/electron/electron/issues/3642
//    4. https://stackoverflow.com/questions/47597982/send-sync-message-from-ipcmain-to-ipcrenderer-electron

/* -- Types --------------------------------------------- */

export type FunctionPropertyNames<T> = {
	[K in keyof T]:
		K extends string
			? (T[K] extends Function ? K : never)
			: never
}[keyof T];

/* -- Invoker ------------------------------------------- */

interface Invokable {
	invoke: (channel: string, ...args: any[]) => void;
};

/**
 * Creates a Proxy which redirects any methods (of type T)
 * through the invoke() function of the given invokable
 * argument, allowing for type-checked ipc events!
 *
 * Set up to allow us to write type-safe event code like:
 *
 *     interface H { addPerson(name:string, age:int) }
 *     let proxy:H = invokerFor<H>("CHANNEL", logPrefix, "EXTRA")
 *
 *     proxy.addPerson("Andy", 51)
 *     proxy.addPerson("Beth", 28)
 *
 * which will be the same as the following manual invocations:
 *
 *     ipc.invoke("CHANNEL", "EXTRA", "addPerson", "Andy", 51)
 *     ipc.invoke("CHANNEL", "EXTRA", "addPerson", "Beth", 28)
 *
 * @param ipc An invokeable object to be wrapped by the proxy.
 * @param channel The first argument to ipc.invoke(), representing an event channel.
 * @param logPrefix Prefix to use when logging invocations.
 * @param args The remaining arguments will be passed as arguments to invoke(),
 *    and will appear before any arguments passed to a method called on the proxy.
 *    This behavior is useful when we need to "route" messages through a hierarchy
 *    on the receiving side.
 */
export function invokerFor<T>(ipc: Invokable, channel:string="command", logPrefix:string, ...const_args:unknown[]): T {
	const proxy = new Proxy({ ipc }, {
		get(target, prop: FunctionPropertyNames<T>) {
			return async (data: unknown) => {
				console.log(`[${logPrefix}] :: invoke event :: prop=${prop}, channel=${channel}, const_args=${const_args}`);
				let result = target.ipc.invoke(channel, ...const_args, prop, data);
				return result;
			}
		}
	});

  // TODO (Ben @ 2023/04/30) any way to avoid cast here?
  // the cast *should* be sound, because of the way we build the proxy
  return proxy as T;
}
