import { EventEmitter } from "events";
import fs from "fs";
import * as pathlib from "path";

// project imports
import { IDirEntry } from "@common/fileio";
import { FsalEvents, ChokidarEvents } from "@common/events";
import FSALWatchdog from "./fsal-watcher";

////////////////////////////////////////////////////////////

export default class FSAL extends EventEmitter {

	private _watchdog:FSALWatchdog;
	private _globalWatchdog:FSALWatchdog;

	// == CONSTRUCTOR =================================== //

	constructor(){
		super();
		this._watchdog = new FSALWatchdog(/*ignoreDotfiles=*/true);
		this._globalWatchdog = new FSALWatchdog(/*ignoreDotfiles=*/false);

		// bind event listeners
		this.handleChokidarEvent = this.handleChokidarEvent.bind(this);
		this.handleGlobalChokidarEvent = this.handleGlobalChokidarEvent.bind(this);
	}

	// == LIFECYCLE ===================================== //

	async init(){
		console.log("fsal :: init()");
		this._watchdog.init();
		this.attachEvents();
	}

	async destroy(){
		console.log("fsal :: destroy()");
		this._watchdog.destroy();
		this.detachEvents();
	}

	// == EVENTS ======================================== //

	attachEvents(){
		this._watchdog.on(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent);
		this._globalWatchdog.on(FsalEvents.CHOKIDAR_EVENT, this.handleGlobalChokidarEvent);
	}

	detachEvents(){
		this._watchdog.off(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent);
		this._globalWatchdog.off(FsalEvents.CHOKIDAR_EVENT, this.handleGlobalChokidarEvent);
	}

	async handleChokidarEvent(event:ChokidarEvents, info:{path:string}):Promise<void> {
		console.log(`fsal :: chokidar-event :: ${event}`, info.path);

		// handle errors
		if (event == ChokidarEvents.ERROR) {
			throw new Error(`fsal :: chokidar error :: ${info}`);
		}
		
		// emit events
		this.emit(FsalEvents.CHOKIDAR_EVENT, event, info);
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
	}

	async handleGlobalChokidarEvent(event:ChokidarEvents, info:{path:string}):Promise<void> {
		console.log(`fsal :: global-chokidar-event :: ${event}`, info.path);

		// handle errors
		if (event == ChokidarEvents.ERROR) {
			throw new Error(`fsal :: chokidar error :: ${info}`);
		}
		
		// emit events
		this.emit(FsalEvents.GLOBAL_CHOKIDAR_EVENT, event, info);
	}

	// == FILE / DIR UNLOADING ========================== //

	unloadAll():void {
		this._watchdog.unwatchAll();
		this._globalWatchdog.unwatchAll();
		this.emit(FsalEvents.STATE_CHANGED, 'filetree');
	}

	// == WORKSPACE ===================================== //

	watch(p:string)   { this._watchdog.watch(p);   }
	unwatch(p:string) { this._watchdog.unwatch(p); }

	watchGlobal(p:string)   { this._globalWatchdog.watch(p);   }
	unwatchGlobal(p:string) { this._globalWatchdog.unwatch(p); }

	// == OPEN/CLOSE FILES ============================== //

	async createFile(path: string, contents: string = ""): Promise<void> {
		// normalize path (in an attempt to prevent different hashes for the same path)
		path = pathlib.normalize(path);
		// write file if doesn't exist
		return fs.promises.writeFile(path, contents, {flag : "wx" });
	}
}