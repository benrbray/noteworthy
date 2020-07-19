// node imports
import * as pathlib from "path";

// electron imports
import { app, ipcMain, Event, IpcMainInvokeEvent } from "electron";
import { enforceMacOSAppLocation, is } from 'electron-util';
import { EventEmitter } from "events";

// project imports
import Main from "./windows/main";
import Window from "./windows/window";
import { MainIpcEvents, MainIpcHandlers } from "./MainIPC";
import FSAL from "./fsal/fsal";
import * as FSALDir from "./fsal/fsal-dir";
import { CrossRefPlugin } from "./plugins/crossref-plugin";
import { WorkspacePlugin } from "./plugins/plugin";
import { Workspace } from "./workspace/workspace";
import { senderFor, invokerFor } from "@common/ipc";
import { IDirectory, IFileMeta, IDirEntryMeta } from "@common/fileio";
import { FsalEvents, AppEvents, ChokidarEvents, IpcEvents } from "@common/events";
import { RendererIpcEvents, RendererIpcHandlers } from "@renderer/RendererIPC";

////////////////////////////////////////////////////////////

export default class NoteworthyApp extends EventEmitter {
	window: Window | undefined;
	
	/** proxy for SENDING events to the render process */
	_renderProxy: null | RendererIpcHandlers;
	/** handlers for events RECEIVED from the render process */
	_eventHandlers:MainIpcHandlers;
	/** file system abstraction layer */
	_fsal:FSAL;
	/** supports working from a single root directory */
	private _workspace: null | Workspace;

	constructor(){
		super();

		this._renderProxy = null;
		this._eventHandlers = new MainIpcHandlers(this);
		this._fsal = new FSAL();
		this._workspace = null;

		// bind event handlers
		this.handleChokidarEvent = this.handleChokidarEvent.bind(this);

		this.init();
		this.attachEvents();
	}

	// INITIALIZATION //////////////////////////////////////

	init(){
		// services
		this.initIPC();
		this.initFSAL();

		// menus
		this.initContextMenu();
		this.initMenu();
	}

	initIPC(){
		ipcMain.handle("command", (evt: IpcMainInvokeEvent, key: MainIpcEvents, data: any) => {
			console.log(`MainIPC :: handling event :: ${key}`);
			return this.handle(key, data);
		});

		global.ipc = {
			/**
			 * Executes a command in the main process.
			 * @param cmd The command to be sent
			 * @param arg An optional object with data.
			 */
			handle: async (cmd: MainIpcEvents, arg?: any) => { return this.handle(cmd, arg); },
			/**
			 * Sends an arbitrary command to the renderer.
			 * @param cmd The command to be sent
			 * @param arg An optional object with data.
			 */
			send: (cmd: RendererIpcEvents, arg?: any): void => { 
				if(this._renderProxy !== null){
					this._renderProxy[cmd](arg);
				} else {
					throw new Error("app :: no renderer to send events to!")
				}
			},
			/**
			 * Sends a message to the renderer and displays it as a notification.
			 * @param  {String} msg The message to be sent.
			 * @return {void}       Does not return.
			 */
			notify: (msg:string):void => { this.handle("showNotification", msg); },
			/**
			 * Sends an error to the renderer process that should be displayed using
			 * a dedicated dialog window (is used, e.g., during export when Pandoc
			 * throws potentially a lot of useful information for fixing problems in
			 * the source files).
			 * @param  {Object} msg        The error object
			 * @return {void}            Does not return.
			 */
			notifyError: (msg:any): void => { this.handle("showError", msg); }
		}
	}

	initFSAL(){
		this._fsal.init();
	}

	initContextMenu(){}
	initMenu(){}
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
		this.detach__beforeQuit();
		this.closeWorkspace()
		this._fsal.destroy();
		app.quit();
	}

	load(){
		if(this.window){
			/** @todo handle window exists? */
		}
		console.log("app :: load")
		this.window = new Main();
		this.window.init();

		// deprecated 
		// this._renderProxy = senderFor<RendererIpcHandlers>(
		// 	this.window.window.webContents,
		// 	"mainCommand", "main->render"
		// );

		this._renderProxy = invokerFor<RendererIpcHandlers>(
			this.window,
			IpcEvents.RENDERER_INVOKE, "main->render"
		);
	}

	// == Workspaces ==================================== //

	getWorkspaceDir(): (IDirectory | null) {
		return this._workspace && this._workspace.dir;
	}

	async setWorkspaceDir(dirPath:string):Promise<boolean>{
		console.log("app :: setWorkspaceDir() ::", dirPath);
		// close active workspace
		this.closeWorkspace();

		// get directory info
		let dir:IDirectory = await FSALDir.parseDir(dirPath);
		
		// define plugins
		let plugins: WorkspacePlugin[] = [
			new CrossRefPlugin(this)
		];

		// load (possibly stale) workspace metadata from file
		this._workspace = await Workspace.fromDir(dir, plugins, true);
		if (!this._workspace) {
			console.error("fsal :: unknown error opening workspace")
			return false;
		}

		// watch workspace directory
		this._fsal.watch(dir.path);

		// check for changes between current file list and saved metadata,
		// and process added/changed/deleted files if needed
		let result = await this._workspace?.update();

		// emit change event
		this._renderProxy?.fileTreeChanged(this.getFileTree());
		
		return true === result;
	}

	get workspace():Workspace|null {
		return this._workspace;
	}

	async closeWorkspace(persist:boolean = true): Promise<boolean> {
		if(!this._workspace){ return true; }
		this._fsal.unwatch(this._workspace.dir.path);
		this._fsal.unloadAll();
		this._workspace.close(persist);
		this._workspace = null;
		return true;
	}

	/**
	 * Convert a workspace-relative path to an absolute path.
	 * @returns An absolute path, or NULL if no workspace exists.
	 */
	resolveWorkspaceRelativePath(relPath: string): string | null {
		let workspacePath = this.getWorkspaceDir()?.path;
		if (!workspacePath) { return null; }

		/** @todo (6/27/20) error if the resulting abs path
		 * is not inside the workspace (e.g. if relPath="../../..")
		 */
		relPath = pathlib.normalize(relPath);
		return pathlib.join(workspacePath, relPath);
	}

	// == Files ========================================= //

	getFileByHash(hash: string): (IFileMeta | null) {
		if (!this._workspace) { return null; }
		return this._workspace.getFileByHash(hash);
	}

	getFileTree(): IDirEntryMeta[] {
		// handle empty workspace
		if (!this._workspace) { return []; }
		return this._workspace.getFileTree();
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

	// == Tags ========================================== //

	/**
	 * @returns NULL when the plugin is not available, otherwise
	 *    a list of hashes for files which define this tag
	 * @todo (6/28/20) how to separate plugin code from app code?
	 */
	getDefsForTag(tag:string):string[]|null {
		if(!this._workspace) { return []; }
		let crossRefPlugin = this._workspace.getPluginByName("crossref_plugin");
		return crossRefPlugin && crossRefPlugin.getDefsForTag(tag);
	}
	/**
	 * @returns NULL when the plugin is not available, otherwise
	 *    a list of hashes for files which define this tag
	 * @todo (6/28/20) how to separate plugin code from app code?
	 */
	getTagMentions(tag:string):string[]|null {
		if(!this._workspace) { return []; }
		let crossRefPlugin = this._workspace.getPluginByName("crossref_plugin");
		return crossRefPlugin && crossRefPlugin.getTagMentions(tag);
	}

	// EVENTS //////////////////////////////////////////////

	async handle<T extends MainIpcEvents>(name: T, data: Parameters<MainIpcHandlers[T]>[0]) {
		/** @remark (6/25/20) cannot properly type-check this call
		 *  without support for "correlated record types", see e.g.
		 *  (https://github.com/Microsoft/TypeScript/issues/30581)
		 */
		return this._eventHandlers[name](data as any);
	}

	async handleChokidarEvent(event: ChokidarEvents, info: { path: string }): Promise<void> {
		console.log(`app :: chokidar-event :: ${event}`, info.path);
		// handle errors
		if (event == ChokidarEvents.ERROR) { throw new Error(`app :: chokidar error :: ${info}`); }
		/** @todo (6/19/20) what to do about file changes outside workspace? */
		/** @todo (6/19/20) what to do about file changes when no workspace active? */
		await this._workspace?.handleChangeDetected(event, info);
		// file tree changed
		await this._renderProxy?.fileTreeChanged(this.getFileTree());
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
		if(is.macos){ return this.initMenu(); };
		this.quit();
	}

	__activate = () => {
		console.log("app :: __activate");
		if(this.window && this.window.window) return;
		this.load();
	}

	__beforeQuit = (event:Event) => {
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