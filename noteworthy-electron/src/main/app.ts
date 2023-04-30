// node imports
import * as pathlib from "path";

// electron imports
import { app, ipcMain, IpcMainInvokeEvent } from "electron";
import { enforceMacOSAppLocation } from 'electron-util';
import { EventEmitter } from "events";

// project imports
import MainWindow from "./windows/main";
import {
	MainIpc_FileHandlers, MainIpc_TagHandlers, MainIpc_DialogHandlers,
	MainIpc_LifecycleHandlers, MainIpc_ThemeHandlers, MainIpc_ShellHandlers,
	MainIpcHandlers, MainIpc_OutlineHandlers,
	MainIpc_MetadataHandlers,
	MainIpc_NavigationHandlers,
	MainIpc_CitationHandlers,
	MainIpcChannelName
} from "./MainIPC";
import { FSAL } from "./fsal/fsal";
import { invokerFor, FunctionPropertyNames } from "@common/ipc";
import { IDirEntryMeta, IFileMeta, IPossiblyUntitledFile } from "@common/files";
import { IpcEvents } from "@common/events";
import { WorkspaceService, WorkspaceEvent } from "./workspace/workspace-service";
import { ThemeService, ThemeEvent } from "./theme/theme-service";
import { PluginService } from "./plugins/plugin-service";

////////////////////////////////////////////////////////////

// import { RendererIpcHandlers } from "@renderer/RendererIPC";

// TODO (Ben @ 2023/04/30) factor out common module for ipc, rather than duplicating
interface RendererIpcHandlers {
	menuFileSave: () => Promise<void>;
	menuFileSaveAs: () => Promise<void>;
	fileTreeChanged: (fileTree:IDirEntryMeta[]) => Promise<void>;
	fileDidSave: (data:{ saveas:boolean , path:string }) => Promise<void>;
	fileDidOpen: (file: IPossiblyUntitledFile) => Promise<void>
	navHistoryChanged: (history: { history: IFileMeta[], currentIdx: number }) => Promise<void>;
	requestFileClose: () => Promise<void>;
	requestClose: () => Promise<void>;
	applyThemeCss: (cssString:string) => Promise<void>
}

////////////////////////////////////////////////////////////

export default class NoteworthyApp extends EventEmitter {
	window: MainWindow | undefined;

	/** proxy for SENDING events to the render process */
	_renderProxy: null | RendererIpcHandlers;
	/** handlers for events RECEIVED from the render process */
	_eventHandlers: MainIpcHandlers;

	constructor(
		/** file system abstraction layer */
		private _fsal: FSAL,
		private _workspaceService:WorkspaceService,
		private _pluginService:PluginService,
		private _themeService:ThemeService
	){
		super();

		// bind event handlers
		this._eventHandlers = this.makeHandlers();
		this.handleFileTreeChanged = this.handleFileTreeChanged.bind(this);
		this.handleThemeChanged = this.handleThemeChanged.bind(this);

		this.init();
		this.attachEvents();

		// create window
		this.window = new MainWindow(this);

		// render proxy
		this._renderProxy = invokerFor<RendererIpcHandlers>(
			this.window,               // object to proxy
			IpcEvents.RENDERER_INVOKE, // channel
			"main->render"             // log prefix
		);
	}

	// INITIALIZATION //////////////////////////////////////

	init(){
		ipcMain.handle(
			"command",
			<C extends MainIpcChannelName>(
				evt: IpcMainInvokeEvent, channel: C,
				key: FunctionPropertyNames<MainIpcHandlers[C]>, data: any
			) => {
				console.log(`MainIPC :: handling event :: ${channel} ${key}`);
				return this.handle(channel, key, data);
			}
		);
	}


	/** @todo (9/13/20) re-visit ipc dependency injection
	 *
	 * Here, we perform a kind of manual dependency injection.
	 *
	 * In a larger codebase, a dependency injection framework
	 * might be appropriate, but our dependence structure is
	 * simple enough for us to manage dependencies manually.
	 */
	makeHandlers(): MainIpcHandlers {
		console.log("app :: makeHandlers");
		console.log("app :: makeHandlers :: pluginService", this._pluginService);
		console.log("app :: makeHandlers :: themeService", this._themeService);
		// handlers with no dependencies
		let lifecycleHandlers  = new MainIpc_LifecycleHandlers(this);
		let shellHandlers      = new MainIpc_ShellHandlers();

		// handlers with a single dependency
		let fileHandlers       = new MainIpc_FileHandlers(this, this._fsal, this._workspaceService);
		let tagHandlers        = new MainIpc_TagHandlers(this, this._workspaceService, this._pluginService);
		let navigationHandlers = new MainIpc_NavigationHandlers(this, this._workspaceService, this._pluginService);
		let dialogHandlers     = new MainIpc_DialogHandlers(this, this._fsal, this._workspaceService);
		let outlineHandlers    = new MainIpc_OutlineHandlers(this._pluginService);
		let themeHandlers      = new MainIpc_ThemeHandlers(this._themeService);
		let metadataHandlers   = new MainIpc_MetadataHandlers(this._pluginService);
		let citationHandlers   = new MainIpc_CitationHandlers(this, this._pluginService);

		return {
			lifecycle:  lifecycleHandlers,
			file:       fileHandlers,
			theme:      themeHandlers,
			shell:      shellHandlers,
			dialog:     dialogHandlers,
			tag:        tagHandlers,
			outline:    outlineHandlers,
			metadata:   metadataHandlers,
			navigation: navigationHandlers,
			citations:  citationHandlers
		}
	}

	// == Quitting ====================================== //

	/**
	 * Perform all steps needed to shut down the application.
	 * @caution Actually shuts down!  Doesn't ask about unsaved changes!)
	 */
	quit(){
		// announce globally that we're actually quitting!
		global.isQuitting = true;
		// clean up
		/** @todo (9/13/20) these are global services,
		 *    is it actually appropriate to destroy them here?
		 */
		// this.detach__beforeQuit();
		this._workspaceService.closeWorkspace()
		this._fsal.close();
		app.quit();
	}

	// == File Types ==================================== //

	/**
	 * @returns a string representing the default contents
	 *     of a file with the given extension and name.
	 * @param fileExt A string like ".md", ".txt", etc.
	 * @param fileName `fileExt` will be stripped from name, if present.
	 */
	getDefaultFileContents(fileExt:string, fileName:string):string {
		/** @todo (6/27/20) don't use file ext to determine file type
		 * (user should be able to e.g. specify a different editor type
		 * than the default for .md files)
		 */
		 /** @todo (9/14/20) this function does not belong in NoteworthyApp */
		if(fileExt == ".md" || fileExt == ".txt"){
			let name = pathlib.basename(fileName, fileExt);
			return `# ${name}`;
		} else {
			return "";
		}
	}

	// EVENTS //////////////////////////////////////////////

	/** @todo (9/13/20) ideally we would write something like this:
	 *
	 *      async handle<S extends MainIpcChannel, T extends MainIpcEvents[S]>
	 *
	 *   where MainIpcEvents is a mapped type
	 *
	 *       export type MainIpcEvents = {
	 *           [K in (keyof MainIpcHandlers)] : FunctionPropertyNames<MainIpcHandlers[K]>
	 *       }
	 *
	 *   this would let us modify the notion of "what constitutes an event name"
	 *   without having to manually update the signature of handle().
	 *
	 *   However, this won't typecheck!  We need correlated record types yet again!!!
	 */
	async handle<C extends MainIpcChannelName, T extends FunctionPropertyNames<MainIpcHandlers[C]>>(
			channel: C,
			name: T,
			/** @todo now we only take the FIRST parameter of each handler -- should we take them all? */
			data?: unknown //Parameters<MainIpcHandlers[C][T]>[0]
	) {
		/** @remark (6/25/20) cannot properly type-check this call
		 *  without support for "correlated record types", see e.g.
		 *  (https://github.com/Microsoft/TypeScript/issues/30581)
		 */

		// TODO (Ben @ 2023/04/29) workaround to breaking change in TypeScript 4.5
		// (https://github.com/benrbray/noteworthy/issues/30)
		// @ts-ignore
		return this._eventHandlers[channel][name](data)
	}

	async handleFileTreeChanged(fileTree: IDirEntryMeta[]): Promise<void> {
		await this._renderProxy?.fileTreeChanged(fileTree);
	}

	async handleThemeChanged(cssString:string): Promise<void> {
		await this._renderProxy?.applyThemeCss(cssString);
	}

	attachEvents(){
		// this.attachWindowEvents();

		/** @todo (9/13/20) type-checked workspace events */
		this._workspaceService.on(WorkspaceEvent.FILETREE_CHANGED, this.handleFileTreeChanged );
		this._themeService.on(ThemeEvent.THEME_CHANGED, this.handleThemeChanged);
	}

	detachEvents(){
		this._workspaceService.off(WorkspaceEvent.FILETREE_CHANGED, this.handleFileTreeChanged);
		this._themeService.off(ThemeEvent.THEME_CHANGED, this.handleThemeChanged);
		// this.detachWindowEvents();
	}

	// Attach / Detach Events ------------------------------

	/** @todo (6/28/20) all this window boilerplate should be somewhere else */

	attachWindowEvents() {
		// this.attach__windowAllClosed();
		// this.attach__activate();
		// this.attach__beforeQuit();
		// this.attach__forceQuit();
		// this.attach__ready();
		// this.attach__cwdChanged();
		// this.attach__updaterCheck();
	}

	// detachWindowEvents() {
	// 	/** @todo (6/28/20) any need to detach window events? */
	// }

	// attach__windowAllClosed = () =>
	// 	{ app.on("window-all-closed", this.__windowAllClosed); }

	// attach__activate = () =>
	// 	{ app.on("activate", this.__activate); }

	// attach__beforeQuit = () =>
	// 	{ app.on("before-quit", this.__beforeQuit); }
	// detach__beforeQuit = () =>
	// 	{ app.removeListener("before-quit", this.__beforeQuit); }

	// attach__forceQuit = () =>
	// 	{ ipcMain.on("force-quit", this.__forceQuit); }

	// attach__ready = () =>
	// 	{ app.on("ready", this.__ready); }

	// attach__cwdChanged = () =>
	// 	{ ipcMain.on("cwd-changed", this.__cwdChanged); }

	// attach__updaterCheck = () =>
	// 	{ ipcMain.on("updater-check", this.__updaterCheck); }

	// Event Handlers --------------------------------------

	// __windowAllClosed = () => {
	// 	console.log("app :: __windowAllClosed");
	// 	/** @todo (9/13/20) why is this here? */
	// 	//if(is.macos){ return this.initMenu(); };
	// 	this.quit();
	// }

	// __activate = () => {
	// 	console.log("app :: __activate");
	// 	if(this.window && this.window.window) return;
	// 	this.load();
	// }

	// __beforeQuit = () => {
	// 	console.log("app :: __beforeQuit")
	// 	if (!this.window || !this.window.window) { return; }
	// 	// TODO: this line comes from Notable, but it seems to
	// 	// prevent the application from actually closing.  Why was it here?
	// 	//event.preventDefault();
	// 	this.window.window.webContents.send(AppEvents.APP_QUIT)
	// }

	// __forceQuit = () => {
	// 	console.log("app :: __forceQuit")
	// 	this.quit();
	// }

	// __ready = () => {
	// 	enforceMacOSAppLocation();
	// 	this.load();
	// }

	// __cwdChanged = () => {
	// 	if(this.window && this.window.window){
	// 		this.window.window.once("closed", this.load.bind(this));
	// 		this.window.window.close();
	// 	} else {
	// 		this.load();
	// 	}
	// }

}
