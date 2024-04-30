import { EventEmitter } from "events";
import * as pathlib from "path";
import dedent from "dedent-js";

// project imports
import hash from "@common/util/hash";
import isFile from "@common/util/is-file";
import isDir from "@common/util/is-dir";
import { ignoreDir } from "@common/util/ignore-dir";
import { ignoreFile } from "@common/util/ignore-file";
import { IFileDesc, IDirectory } from "@common/files";
import { FsalEvents, ChokidarEvents } from "@common/events";
import { FSAL } from "@main/fsal/fsal";


////////////////////////////////////////////////////////////

const FsalNotInitializedError = () => { new Error("[fsal] not initialized!"); }
const FsalAlreadyInitializedError = () => { new Error("[fsal] cannot initialize twice"); }

////////////////////////////////////////////////////////////

export interface MockFile {
	type: "file",
	path: string,
	contents: string
}

export interface MockFolder {
	type: "folder",
	name: string,
	children: (MockFile|MockFolder)[]
}

////////////////////////////////////////////////////////////

export default class FSALMock extends EventEmitter implements FSAL {

	private _files : { [path:string] : string }

	// == CONSTRUCTOR =================================== //

	constructor(files: MockFile[]){
		super();
		this._files = { };

		for(let file of files) {
			this.saveFile(file.path, file.contents);
		}
	}

	// == READ / SAVE =================================== //

	readFile(filePath: string): string | null {
		console.log("fsal-mock :: readFile ::", filePath);
		// normalize and strip trailing slash
		filePath = pathlib.normalize(filePath);
		if(filePath.endsWith(pathlib.sep)) {
			throw new Error(`readFile() received a directory! ${filePath}`);
		}

		return this._files[filePath];

		// // split path into parts
		// let parts = filePath.split(pathlib.sep);
		// let folderNames = parts.slice(0, -2);
		// let fileName = parts[parts.length - 1];
		// let fileExt = pathlib.extname(filePath);

		// // traverse folders
		// let folder = ROOT_FOLDER;
		// for(let k = 0; k < folderNames.length; k++) {
		// 	let folderName = folderNames[k];
			
		// 	for(let child of folder.children) {
		// 		if(child.type === "folder" && child.name === folderName) {
		// 			folder = child;
		// 			continue;
		// 		}
		// 	}
			
		// 	// not found
		// 	return null;
		// }

		// // look for file
		// for(let child of folder.children) {
		// 	if(child.type === "file" && child.name === fileName && child.ext === fileExt) {
		// 		return child.contents;
		// 	}
		// }

		// // not found
		// return null;
	}

	async saveFile(filePath: string, fileText: string, mkdirs: boolean = true): Promise<boolean> {
		console.log("fsal-mock :: saveFile ::", filePath);
		// normalize and ensure path is not a folder
		filePath = pathlib.normalize(filePath);
		if(filePath.endsWith(pathlib.sep)) {
			throw new Error(`saveFile() received a directory! ${filePath}`);
		}

		this._files[filePath] = fileText;
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
		return true;
	}

	async createFile(path: string, contents: string = ""): Promise<boolean> {
		return this.saveFile(path, contents);
	}

	// == SILENT OPERATIONS ============================= //

	/**
	 * Saves the file, without directly announcing the change.
	 * Instead, emits the same event that chokidar would emit
	 * when it detects that the file has changed.
	 */
	async silentlySaveFile(filePath: string, fileText: string, mkdirs: boolean = false): Promise<boolean> {
		console.log("fsal-mock :: silentlySaveFile ::", filePath);
		// normalize and ensure path is not a folder
		filePath = pathlib.normalize(filePath);
		if(filePath.endsWith(pathlib.sep)) {
			throw new Error(`saveFile() received a directory! ${filePath}`);
		}

		this._files[filePath] = fileText;
		this.emit(FsalEvents.CHOKIDAR_EVENT, ChokidarEvents.CHANGE_FILE, { path: filePath });
		return true;
	}

	async silentlyCreateFile(filePath: string, fileText: string, mkdirs: boolean = false): Promise<boolean> {
		return this.silentlySaveFile(filePath, fileText, mkdirs);
	}

	/**
	 * Deletes the file, without directly announcing the change.
	 * Instead, emits the same event that chokidar would emit
	 * when it detects that the file has been deleted.
	 */
	async silentlyDeleteFile(filePath: string) {
		delete this._files[filePath];
		this.emit(FsalEvents.CHOKIDAR_EVENT, ChokidarEvents.UNLINK_FILE, { path: filePath });
	}

	// == FILE / DIR METADATA =========================== //

	async parseDir(dirPath: string, parent: IDirectory | null = null): Promise<IDirectory> {
		console.log("fsal-mock :: parseDir ::", dirPath);
		let dir:IDirectory = {
			type: "directory",
			parent: parent,
			path: dirPath,
			name: pathlib.basename(dirPath),
			hash: hash(dirPath),
			children: [],
			modTime: 0
		}

		// parse directory contents recursively
		// TODO: don't do it this way :)
		let children = Object.keys(this._files);

		let entries: IFileDesc[] = [];
		for(let childPath of children) {
			let child = await this.parseFile(childPath);
			if(!child){ continue; }
			entries.push(child);
		}

		dir.children = entries;
		return dir;
	}

	async parseFile(filePath: string, parent: IDirectory | null = null): Promise<IFileDesc | null> {
		console.log("fsal-mock :: parseFile ::", filePath);

		let file:IFileDesc = {
			type: "file",
			parent : parent,
			dirPath : pathlib.dirname(filePath),
			path: filePath,
			name : pathlib.basename(filePath),
			hash : hash(filePath),
			ext : pathlib.extname(filePath),
			contents : null,
			modTime: 0,
			creationTime: 0,
			//lineFeed: "\n"
		}

		return file;
	}

	// == LIFECYCLE ===================================== //

	async init() {
		console.log("fsal :: init()");
	}

	async close() {

	}

	// == EVENTS ======================================== //

	private async handleChokidarEvent(event:ChokidarEvents, info:{path:string}):Promise<void> {
		console.log(`fsal :: chokidar-event :: ${event}`, info.path);

		// handle errors
		if (event == ChokidarEvents.ERROR) {
			throw new Error(`fsal :: chokidar error :: ${info}`);
		}
		
		// emit events
		this.emit(FsalEvents.CHOKIDAR_EVENT, event, info);
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
	}

	private async handleGlobalChokidarEvent(event:ChokidarEvents, info:{path:string}):Promise<void> {
		console.log(`fsal :: global-chokidar-event :: ${event}`, info.path);

		// handle errors
		if (event == ChokidarEvents.ERROR) {
			throw new Error(`fsal :: chokidar error :: ${info}`);
		}
		
		// emit events
		this.emit(FsalEvents.GLOBAL_CHOKIDAR_EVENT, event, info);
	}

	// == WORKSPACE ===================================== //

	watch(p:string) { 
		// if(!this._resources){ throw FsalNotInitializedError() };
		// this._resources.watchdog.watch(p);
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
	}

	watchGlobal(p:string) {
		// if(!this._resources){ throw FsalNotInitializedError() };
		// this._resources.globalWatchdog.watch(p);
	}
}