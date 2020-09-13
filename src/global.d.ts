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

interface IWatchdog {
	addPath: (p:string) => void;
	ignoreNext: (event, path:string) => void;
	stop: () => void;
	on: (event, callback:((...args:any[])=>void)) => void;
	off: (event, callback: ((...args: any[]) => void)) => void;
}

/** @todo (9/13/20) remove as many globals as possible */
declare namespace NodeJS {
	interface Global {
		isQuitting?: boolean;
		log: ILogger;
		tags:ITagManager;
		application:IAppManager;
		watchdog:IWatchdog;
	}
}

interface ProxyConstructor {
	new <TSource extends object, TTarget extends object>(target: TSource, handler: ProxyHandler<TSource>): TTarget;
}