// node imports
import * as pathlib from "path";

// electron imports
import { app, ipcMain, Event, IpcMainInvokeEvent, Menu } from "electron";
import { enforceMacOSAppLocation, is } from 'electron-util';
import { EventEmitter } from "events";

// project imports
import Main from "./windows/main";
import Window from "./windows/window";
import { MainIpc_FileHandlers, MainIpc_TagHandlers, MainIpc_DialogHandlers, MainIpc_LifecycleHandlers, MainIpc_ThemeHandlers, MainIpc_ShellHandlers, MainIpcHandlers, MainIpcChannel } from "./MainIPC";
import FSAL from "./fsal/fsal";
import { Workspace } from "./workspace/workspace";
import { invokerFor, FunctionPropertyNames } from "@common/ipc";
import { IDirEntryMeta } from "@common/fileio";
import { FsalEvents, AppEvents, ChokidarEvents, IpcEvents } from "@common/events";
import { RendererIpcHandlers } from "@renderer/RendererIPC";
import { promises as fs } from "fs";
import { WorkspaceService, WorkspaceEvent } from "./workspace/workspace-service";
import { CrossRefService } from "./plugins/crossref-service";
import { ThemeService, ThemeEvent } from "./theme/theme-service";

////////////////////////////////////////////////////////////

export default class NoteworthyApp extends EventEmitter {
	window: Window | undefined;
	
	/** proxy for SENDING events to the render process */
	_renderProxy: null | RendererIpcHandlers;
	/** handlers for events RECEIVED from the render process */
	_eventHandlers: MainIpcHandlers;
	/** supports working from a single root directory */
	private _workspace: null | Workspace;

	constructor(
		/** file system abstraction layer */
		private _fsal:FSAL,
		private _workspaceService:WorkspaceService,
		private _crossRefService:CrossRefService,
		private _themeService:ThemeService
	){
		super();
		this._renderProxy = null;

		this._eventHandlers = this.makeHandlers();
		this._workspace = null;

		// bind event handlers
		this.handleChokidarEvent = this.handleChokidarEvent.bind(this);


		/** @todo (9/13/20) type-checked workspace events */
		this._workspaceService.on(WorkspaceEvent.FILETREE_CHANGED,
			(fileTree: IDirEntryMeta[]) => {
				this._renderProxy?.fileTreeChanged(fileTree);
			}
		);

		this._themeService.on(ThemeEvent.THEME_CHANGED,
			(cssString:string) => {
				this._renderProxy?.applyThemeCss(cssString);
			}
		);

		this.init();
		this.attachEvents();
	}

	// INITIALIZATION //////////////////////////////////////

	/**
	 * Here, we perform a kind of manual dependency injection.
	 * 
	 * In a larger codebase, a dependency injection framework
	 * might be appropriate, but our dependence structure is
	 * simple enough for us to manage dependencies manually.
	 *
	 * @todo (9/13/20) re-visit ipc dependency injection
	 */
	makeHandlers(): MainIpcHandlers {
		// handlers with no dependencies
		let lifecycleHandlers = new MainIpc_LifecycleHandlers(this);
		let fileHandlers = new MainIpc_FileHandlers(this, this._fsal, this._workspaceService);
		let shellHandlers = new MainIpc_ShellHandlers(this);

		// handlers with a single dependency
		let dialogHandlers = new MainIpc_DialogHandlers(this, this._workspaceService, fileHandlers);
		let tagHandlers = new MainIpc_TagHandlers(this, this._workspaceService, this._crossRefService, fileHandlers);
		let themeHandlers = new MainIpc_ThemeHandlers(this._themeService);

		return {
			lifecycle: lifecycleHandlers,
			file:      fileHandlers,
			theme:     themeHandlers,
			shell:     shellHandlers,
			dialog:    dialogHandlers,
			tag:       tagHandlers
		}
	}

	init(){
		// services
		this.initIPC();
		// providers
		this.initThemes();
	}

	initIPC(){
		ipcMain.handle("command", <T extends MainIpcChannel>(evt: IpcMainInvokeEvent, channel: T, key: FunctionPropertyNames<MainIpcHandlers[T]>, data: any) => {
			console.log(`MainIPC :: handling event :: ${channel}, ${key}`);
			return this.handle(channel, key, data);
		});
	}

	initThemes(){
		// ensure theme folder exists
		let themeFolder = this._themeService.getThemeFolder();
		fs.mkdir(themeFolder)
			.then(()=>  { console.log("app :: theme folder created at", themeFolder);        })
			.catch(()=> { console.log("app :: theme folder already exists at", themeFolder); });
	}

	async initDebug(){}

	// == Quitting ====================================== //

	/**
	 * Perform all steps needed to shut down the application.
	 * (Note: Actually shuts down!  Doesn't ask about unsaved changes!)
	 */
	quit(){
		// announce globally that we're actually quitting!
		global.isQuitting = true;
		// clean up
		/** @todo (9/13/20) these are global services, 
		 *    is it actually appropriate to destroy them here?
		 */
		this.detach__beforeQuit();
		this._workspaceService.closeWorkspace()
		this._fsal.destroy();
		app.quit();
	}

	load(){
		if(this.window){
			/** @todo handle window exists? */
		}
		console.log("app :: load")
		this.window = new Main("main", this);
		this.window.init();

		this._renderProxy = invokerFor<RendererIpcHandlers>(
			this.window,               // object to proxy
			IpcEvents.RENDERER_INVOKE, // channel
			"main->render"             // log prefix
		);
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
	async handle<S extends MainIpcChannel, T extends FunctionPropertyNames<MainIpcHandlers[S]>>(
			channel:S,
			name: T,
			/** @todo now we only take the FIRST parameter of each handler -- should we take them all? */
			data?: Parameters<MainIpcHandlers[S][T]>[0]
	) {
		/** @remark (6/25/20) cannot properly type-check this call
		 *  without support for "correlated record types", see e.g.
		 *  (https://github.com/Microsoft/TypeScript/issues/30581)
		 */
		return this._eventHandlers[channel][name](data as any);
	}

	async handleChokidarEvent(event: ChokidarEvents, info: { path: string }): Promise<void> {
		console.log(`app :: chokidar-event :: ${event}`, info.path);
		// handle errors
		if (event == ChokidarEvents.ERROR) { throw new Error(`app :: chokidar error :: ${info}`); }
		/** @todo (6/19/20) what to do about file changes outside workspace? */
		/** @todo (6/19/20) what to do about file changes when no workspace active? */
		await this._workspace?.handleChangeDetected(event, info);
		// file tree changed
		await this._renderProxy?.fileTreeChanged(this._workspaceService.getFileTree());
	}

	attachEvents(){
		this.attachWindowEvents();
		this._fsal.on(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent);
	}

	detachEvents(){
		this._fsal.off(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent);
		this.detachWindowEvents();
	}

	// Attach / Detach Events ------------------------------

	/** @todo (6/28/20) all this window boilerplate should be somewhere else */

	attachWindowEvents() {
		this.attach__windowAllClosed();
		this.attach__activate();
		this.attach__beforeQuit();
		this.attach__forceQuit();
		this.attach__ready();
		this.attach__cwdChanged();
		this.attach__updaterCheck();
	}

	detachWindowEvents() {
		/** @todo (6/28/20) any need to detach window events? */
	}

	attach__windowAllClosed = () =>
		{ app.on("window-all-closed", this.__windowAllClosed); }

	attach__activate = () =>
		{ app.on("activate", this.__activate); }

	attach__beforeQuit = () => 
		{ app.on("before-quit", this.__beforeQuit); }
	detach__beforeQuit = () =>
		{ app.removeListener("before-quit", this.__beforeQuit); }

	attach__forceQuit = () => 
		{ ipcMain.on("force-quit", this.__forceQuit); }

	attach__ready = () => 
		{ app.on("ready", this.__ready); }

	attach__cwdChanged = () =>
		{ ipcMain.on("cwd-changed", this.__cwdChanged); }

	attach__updaterCheck = () =>
		{ ipcMain.on("updater-check", this.__updaterCheck); }

	// Event Handlers --------------------------------------

	__windowAllClosed = () => {
		console.log("app :: __windowAllClosed");
		/** @todo (9/13/20) why is this here? */
		//if(is.macos){ return this.initMenu(); };
		this.quit();
	}

	__activate = () => {
		console.log("app :: __activate");
		if(this.window && this.window.window) return;
		this.load();
	}

	__beforeQuit = () => {
		console.log("app :: __beforeQuit")
		if (!this.window || !this.window.window) { return; }
		// TODO: this line comes from Notable, but it seems to
		// prevent the application from actually closing.  Why was it here?
		//event.preventDefault();
		this.window.window.webContents.send(AppEvents.APP_QUIT)
	}

	__forceQuit = () => {
		console.log("app :: __forceQuit")
		this.quit();
	}

	__ready = () => {
		enforceMacOSAppLocation();
		this.initDebug();
		this.load();
	}

	__cwdChanged = () => {
		if(this.window && this.window.window){
			this.window.window.once("closed", this.load.bind(this));
			this.window.window.close();
		} else {
			this.load();
		}
	}

	__updaterCheck = () => {
		/** @todo (7/12/20) automatic updates */
		// updater.removeAllListeners();

		// if (notifications === true) {

		// 	updater.on('update-available', () => Notification.show('A new update is available', 'Downloading it right now...'));
		// 	updater.on('update-not-available', () => Notification.show('No update is available', 'You\'re already using the latest version'));
		// 	updater.on('error', err => {
		// 		Notification.show('An error occurred', err.message);
		// 		Notification.show('Update manually', 'Download the new version manually to update the app');
		// 		shell.openExternal(pkg['download'].url);
		// 	});

		// }

		// updater.checkForUpdatesAndNotify();
	}
}