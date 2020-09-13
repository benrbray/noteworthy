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
import * as FSALDir from "./fsal/fsal-dir";
import { CrossRefPlugin } from "./plugins/crossref-plugin";
import { WorkspacePlugin } from "./plugins/plugin";
import { Workspace } from "./workspace/workspace";
import { invokerFor, FunctionPropertyNames } from "@common/ipc";
import { IDirectory, IFileMeta, IDirEntryMeta } from "@common/fileio";
import { FsalEvents, AppEvents, ChokidarEvents, IpcEvents } from "@common/events";
import { RendererIpcHandlers } from "@renderer/RendererIPC";
import { makeAppMenuTemplate } from "./menus/app-menu";
import { promises as fs } from "fs";
import Settings, { ThemeId } from "@common/settings";

// defined by electron-webpack
declare const __static:string;

////////////////////////////////////////////////////////////

export default class NoteworthyApp extends EventEmitter {
	window: Window | undefined;
	
	/** proxy for SENDING events to the render process */
	_renderProxy: null | RendererIpcHandlers;
	/** handlers for events RECEIVED from the render process */
	_eventHandlers: MainIpcHandlers;
	/** file system abstraction layer */
	_fsal:FSAL;
	/** supports working from a single root directory */
	private _workspace: null | Workspace;

	constructor(){
		super();

		this._renderProxy = null;

		this._eventHandlers = this.makeHandlers();
		this._fsal = new FSAL();
		this._workspace = null;

		// bind event handlers
		this.handleChokidarEvent = this.handleChokidarEvent.bind(this);

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
		let fileHandlers = new MainIpc_FileHandlers(this);
		let themeHandlers = new MainIpc_ThemeHandlers(this);
		let shellHandlers = new MainIpc_ShellHandlers(this);

		// handlers with a single dependency
		let dialogHandlers = new MainIpc_DialogHandlers(this, fileHandlers);
		let tagHandlers = new MainIpc_TagHandlers(this, fileHandlers);

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
		this.initFSAL();

		// providers
		this.initThemes();

		// menus
		this.initContextMenu();
		this.initMenu();
	}

	initIPC(){
		ipcMain.handle("command", <T extends MainIpcChannel>(evt: IpcMainInvokeEvent, channel: T, key: FunctionPropertyNames<MainIpcHandlers[T]>, data: any) => {
			console.log(`MainIPC :: handling event :: ${channel}, ${key}`);
			return this.handle(channel, key, data);
		});
	}

	initFSAL(){
		this._fsal.init();
	}

	initThemes(){
		// ensure theme folder exists
		let themeFolder = this.getThemeFolder();
		fs.mkdir(themeFolder)
			.then(()=>  { console.log("app :: theme folder created at", themeFolder);        })
			.catch(()=> { console.log("app :: theme folder already exists at", themeFolder); });
	}

	initContextMenu(){}
	
	async initMenu(){
		console.log("app :: initMenu()")
		const appMenuTemplate = await makeAppMenuTemplate(this);
		const appMenu = Menu.buildFromTemplate(appMenuTemplate);
		Menu.setApplicationMenu(appMenu);
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
		this.window = new Main("main", this);
		this.window.init();

		this._renderProxy = invokerFor<RendererIpcHandlers>(
			this.window,               // object to proxy
			IpcEvents.RENDERER_INVOKE, // channel
			"main->render"             // log prefix
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
		
		// define plugins
		let plugins: WorkspacePlugin[] = [
			new CrossRefPlugin(this)
		];

		// get directory info
		/** @todo (9/12/20) replace static call with "FsalService" object
		 * > might help to make dependencies more clear
		 * > more mockable
		 */
		let dir:IDirectory = await FSALDir.parseDir(dirPath);

		// load (possibly stale) workspace metadata from file
		/** @todo (9/12/20) replace static call with "WorkspaceService" object
		 * > might help to make dependencies more clear
		 * > more mockable
		 */
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

	// == Themes ======================================== //

	async setTheme(theme:ThemeId|null = null) {
		// use current theme if none provided
		if(theme == null){ theme = Settings.get("theme"); }

		// default vs custom themes
		if(theme.type == "default"){
			// find default theme
			/** @todo (9/12/20) this should be done elsewhere, refactor theme stuff into its own file */
			let themeCssPath:string = "";
			switch(theme.id){
				case "default-dark"  : themeCssPath = pathlib.resolve(__static, 'themes/theme-default-dark.css');  break;
				case "default-light" : themeCssPath = pathlib.resolve(__static, 'themes/theme-default-light.css'); break;
				case "typewriter-light" : themeCssPath = pathlib.resolve(__static, 'themes/theme-typewriter-light.css'); break;
				case "academic-light" : themeCssPath = pathlib.resolve(__static, 'themes/theme-academic-light.css'); break;
				default: console.error(`theme '${theme.id}' not found`); return;
			}

			// read and apply theme
			let cssString:string = await fs.readFile(themeCssPath, { encoding : 'utf8' });
			this._renderProxy?.applyThemeCss(cssString);

			// save theme to user settings
			Settings.set("theme", theme);
		} else if(theme.type == "custom"){
			// read and apply theme
			let cssString:string = await fs.readFile(theme.path, { encoding : 'utf8' });
			this._renderProxy?.applyThemeCss(cssString);
			// save theme to user settings
			Settings.set("theme", theme);
		}
	}

	getThemeFolder(): string {
		/** @todo (9/12/20)
		 * userData folder is different in develop vs production,
		 * still need to test that this works in production
		 */
		return pathlib.join(app.getPath("userData"), "themes");
	}

	async getThemes() {
		return {
			"default" : [
				{ title: "Default Light", id: "default-light" },
				{ title: "Default Dark",  id: "default-dark" },
				{ title: "Typewriter Light",  id: "typewriter-light" },
				{ title: "Academic Light",  id: "academic-light" },
			],
			"custom" : await this.getCustomThemes()
		};
	}

	async getCustomThemes(): Promise<{ title:string, path:string }[]> {
		// attempt to read themes folder, but fail gracefully when it does not exist
		let themeFolder = this.getThemeFolder();

		let filePaths:string[] = [];
		try { 
			filePaths = await fs.readdir(themeFolder);
		} catch(err){
			console.error("themes folder does not exist\n", err);
		}

		// filter .css files
		return filePaths
			.filter(fileName => (pathlib.extname(fileName)==".css"))
			.map(fileName => {
				let path = pathlib.join(themeFolder, fileName);
				return ({ title: fileName, path: path })
			});
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