// type declarations

interface ILogger {
	verbose: ((msg: string, details?: any) => void);
	info: ((msg: string, details?: any) => void);
	warning: ((msg: string, details?: any) => void);
	error: ((msg: string, details?: any) => void);
	showLogViewer: (() => void);
}

interface ITagManager {
	report: (tagArray: string[]) => void;
	remove: (tagArray: string[]) => void;
	getTagDatabase: () => Object;
	getSpecialTags: (name: string) => Tag|undefined;
	getAllSpecialTags: () => Tag[];
	update: (newTags: Tag[]) => boolean;
}

interface IAppManager {
	isBooting: () => boolean;
	/** @todo: (6/6/20) fill in these functions? */
	fileUpdate: (oldHash:string, fileMetadata:IFileMetadata) => void;
	dirUpdate:(oldHash:string, newHash:string) => void;
	notifyChange:(msg:string)=>void;
	findFile:(prop)=>File;
	findDir:(prop)=>File;
	getFile: (fileDesc:IFileDesc)=>IFileWithContents;
}

interface IIPCManager {
	/**
	 * Sends an arbitrary message to the renderer.
	 * @param cmd The command to be sent
	 * @param arg An optional object with data.
	 */
	send: (cmd: import("src/renderer/RendererIPC").RendererIpcEvents, arg?: Object) => void,
	/**
	 * Sends an arbitrary message to the renderer.
	 * @param cmd The command to be sent
	 * @param arg An optional object with data.
	 */
	handle: (cmd: import("src/main/MainIPC").MainIpcEvents, arg?: Object) => void,
	/**
	 * Sends a message to the renderer and displays it as a notification.
	 * @param msg The message to be sent.
	 */
	notify: (msg:string) => void,
	/**
	 * Sends an error to the renderer process that should be displayed using
	 * a dedicated dialog window (is used, e.g., during export when Pandoc
	 * throws potentially a lot of useful information for fixing problems in
	 * the source files).
	 * @param  msg The error object
	 */
	notifyError: (msg:Object) => void;
}

interface IWatchdog {
	addPath: (p:string) => void;
	ignoreNext: (event, path:string) => void;
	stop: () => void;
	on: (event, callback:((...args:any[])=>void)) => void;
	off: (event, callback: ((...args: any[]) => void)) => void;
}

declare namespace NodeJS {
	interface Global {
		isQuitting?: boolean;
		log: ILogger;
		tags:ITagManager;
		application:IAppManager;
		watchdog:IWatchdog;
		ipc:IIPCManager;
	}
}

interface ProxyConstructor {
	new <TSource extends object, TTarget extends object>(target: TSource, handler: ProxyHandler<TSource>): TTarget;
}