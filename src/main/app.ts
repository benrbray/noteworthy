import { app, ipcMain as ipc, Event, IpcMainInvokeEvent, ipcMain } from "electron";
import { enforceMacOSAppLocation, is } from 'electron-util';
import { EventEmitter } from "events";
import Main from "./windows/main";
import Window from "./windows/window";
import { MainIpcEvents, MainIpcHandlers } from "./MainIPC";
import FSAL from "./fsal/fsal";

import * as FSALDir from "./fsal/fsal-dir";
import { CrossRefProvider } from "./providers/crossref-provider";
import { IDirectory } from "@common/fileio";
import { FsalEvents, AppEvents } from "@common/events";
import { RendererIpcEvents, RendererIpcHandlers } from "@renderer/RendererIPC";
import { senderFor } from "@common/ipc";

export default class App extends EventEmitter {
	window: Window | undefined;
	
	_renderProxy:null|RendererIpcHandlers;
	_eventHandlers:MainIpcHandlers;
	_fsal:FSAL;

	// providers
	private _crossRefProvider:CrossRefProvider|undefined;

	constructor(){
		super();

		this._renderProxy = null;
		this._eventHandlers = new MainIpcHandlers(this);
		this._fsal = new FSAL("C:/Users/Ben/Documents/notabledata/notes");

		this.init();
		this.events();
	}

	// INITIALIZATION //////////////////////////////////////

	init(){
		// services
		this.initIPC();
		this.initProviders();
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
			handle: (cmd: MainIpcEvents, arg?: any): void => { this.handle(cmd, arg); },
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

	initProviders(){
		// cross-references
		this._crossRefProvider = new CrossRefProvider(this);
		this._crossRefProvider.init();
		this._fsal.registerWorkspacePlugin(this._crossRefProvider);
	}

	destroyProviders(){
		// cross-references
		if(this._crossRefProvider){
			this._fsal.unregisterWorkspacePlugin(this._crossRefProvider);
			this._crossRefProvider.destroy();
		}
	}

	initFSAL(){
		this._fsal.init();
		this._fsal.on(FsalEvents.STATE_CHANGED, (objPath, ...args) => {
			console.log("app :: fsal-state-changed ::", objPath, ...args);
			switch(objPath){
				case "filetree":
					this.handle("fileTreeChanged", this._fsal.getFileTree())
					break;
				case "workspace":
					this.emit(FsalEvents.WORKSPACE_CHANGED, ...args);
					break;
				default:
					break;
			}
		})
	}

	initContextMenu(){}
	initMenu(){}
	async initDebug(){}

	// == Quitting ====================================== //

	quit(){
		console.log("app :: quit");
		global.isQuitting = true;
		this.detach__beforeQuit();
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
		this._renderProxy = senderFor<RendererIpcHandlers>(this.window.window.webContents, "mainCommand");
	}

	// == Workspaces ==================================== //

	async setWorkspaceDir(dirPath:string){
		let dir:IDirectory = await FSALDir.parseDir(dirPath);
		this._fsal.setWorkspaceDir(dir);
	}

	// == Tags ========================================== //

	getDefsForTag(tag:string):string[] {
		if(!this._crossRefProvider){ return []; }
		return this._crossRefProvider.getDefsForTag(tag)
	}

	// EVENTS //////////////////////////////////////////////

	handle<T extends MainIpcEvents>(name: T, data: Parameters<MainIpcHandlers[T]>[0]) {
		/** @remark (6/25/20) cannot properly type-check this call
		 *  without support for "correlated record types", see e.g.
		 *  (https://github.com/Microsoft/TypeScript/issues/30581)
		 */
		return this._eventHandlers[name](data as any);
	}

	events() {
		this.attach__windowAllClosed();
		this.attach__activate();
		this.attach__beforeQuit();
		this.attach__forceQuit();
		this.attach__ready();
		this.attach__cwdChanged();
		this.attach__updaterCheck();
	}

	// Attach / Detach Events ------------------------------

	attach__windowAllClosed = () =>
		{ app.on("window-all-closed", this.__windowAllClosed); }

	attach__activate = () =>
		{ app.on("activate", this.__activate); }

	attach__beforeQuit = () => 
		{ app.on("before-quit", this.__beforeQuit); }
	detach__beforeQuit = () =>
		{ app.removeListener("before-quit", this.__beforeQuit); }

	attach__forceQuit = () => 
		{ ipc.on("force-quit", this.__forceQuit); }

	attach__ready = () => 
		{ app.on("ready", this.__ready); }

	attach__cwdChanged = () =>
		{ ipc.on("cwd-changed", this.__cwdChanged); }

	attach__updaterCheck = () =>
		{ ipc.on("updater-check", this.__updaterCheck); }

	// Event Handlers --------------------------------------

	__windowAllClosed = () => {
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