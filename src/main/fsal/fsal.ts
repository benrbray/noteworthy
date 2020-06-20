import { EventEmitter } from "events";
import fs from "fs";
import * as pathlib from "path";

// project imports
import { FileHash, IFileDesc, IDirectory, IDirEntry, IDirectoryMeta, readFile, IFileMeta, FileCmp, IWorkspaceDir, IDirEntryMeta } from "@common/fileio";
import isFile from "@common/util/is-file";
import isDir from "@common/util/is-dir";

// fsal imports
import FSALWatchdog from "./fsal-watcher";
import * as FSALFile from "./fsal-file";
import * as FSALDir from "./fsal-dir";
import { FsalEvents, ChokidarEvents } from "@common/events";
import { WorkspaceProvider } from "@main/providers/provider";
import { markdownParser } from "@common/markdown";
import hash from "@common/util/hash";
import { WorkspaceMeta } from "@main/workspace/workspace";

////////////////////////////////////////////////////////////

export default class FSAL extends EventEmitter {

	private _projectDir:string;
	private _watchdog:FSALWatchdog;

	// open files
	private _state: {
		/** any number of files can be open within the root dir */
		openFiles:IFileDesc[];
		/** the currently active file */
		activeFile:IFileDesc|null;
		/** the full filetree */
		fileTree: IDirEntry[];
	}

	/** supports working from a single root directory */
	private _workspace: null | {
		dir:IDirectory;
		metadata:WorkspaceMeta;
		metaPath:string;
	}

	/** plugins which need to know about changes to the workspace */
	private _workspacePlugins : WorkspaceProvider[] = [];

	// == CONSTRUCTOR =================================== //

	constructor(projectDir:string){
		super();

		this._projectDir = projectDir;
		this._watchdog = new FSALWatchdog();

		this._state = {
			activeFile : null,
			openFiles  : [],
			fileTree: []
		}

		this._workspace = null;
	}

	// == LIFECYCLE ===================================== //

	async init(){
		console.log("fsal :: init()");
		this._watchdog.init();
		this.attachEvents();
	}

	async destroy(){
		console.log("fsal :: destroy()");
		this.closeWorkspace();
		this._watchdog.destroy();
		this.detachEvents();
	}

	// == EVENTS ======================================== //

	attachEvents(){
		this._watchdog.on(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent.bind(this));
	}

	detachEvents(){
		this._watchdog.off(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent.bind(this));
	}

	async handleChokidarEvent(event:ChokidarEvents, info:{path:string}):Promise<void> {
		console.log(`fsal :: chokidar-event :: ${event}`, info.path);

		// handle errors
		if (event == ChokidarEvents.ERROR) {
			throw new Error(`fsal :: chokidar error :: ${info}`);
		}
	
		/** @todo (6/19/20) what to do about file changes outside workspace? */
		/** @todo (6/19/20) what to do about file changes when no workspace active? */
		if (!this._workspace) { console.error("fsal :: handleChokidarEvent :: no workspace!"); return; };

		// -- Directory Changes ------------------------- //

		if (event == ChokidarEvents.ADD_DIR) {
			/** @todo (6/19/20) handle chokidar add_dir */
		} else if (event == ChokidarEvents.UNLINK_DIR) {
			/** @todo (6/19/20) handle chokidar unlink_dir */
		}

		// -- File Changes ------------------------------ //
		
		// notify workspace of file change
		await this._workspace.metadata.updatePath(info.path);
		
		// notify plugins
		let file = { path: info.path, hash: hash(info.path) };

		if      (event == ChokidarEvents.UNLINK_FILE) { this.handleWorkspaceFileDeleted(file); }
		else if (event == ChokidarEvents.CHANGE_FILE) { this.handleWorkspaceFileChanged(file); }
		else if (event == ChokidarEvents.ADD_FILE)    { this.handleWorkspaceFileCreated(file); }
		
		// emit events
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
	}

	// == Workspace Metadata ============================ //

	async loadWorkspaceMetadataFromFile(path: string):Promise<WorkspaceMeta|null> {
		let fileContents = readFile(path);
		if(!fileContents){ return null; }
		let workspaceJSON = JSON.parse(fileContents);
		return WorkspaceMeta.fromJSON(workspaceJSON);
	}

	async writeWorkspaceMetadata():Promise<boolean> {
		// ensure metadata exists
		if(!this._workspace) {
			throw new Error("fsal :: no workspace metadata to write!");
		}

		// get plugin data
		let pluginData: any = Object.create(null);
		for (let plugin of this._workspacePlugins) {
			pluginData[plugin.provider_name] = plugin.serialize();
		}
		this._workspace.metadata.plugins = pluginData;

		// write metadata to file
		let path:string = this._workspace.metaPath;
		try {
			// ensure directory exists
			let dirname = pathlib.dirname(path)
			if(!fs.existsSync(dirname)){ fs.mkdirSync(dirname); }
			// write metadata
			fs.writeFileSync(path, JSON.stringify(
				this._workspace.metadata, undefined, 2)
			);
		} catch(err){
			console.error("fsal :: error writing metadata", err);
			return false;
		}
		console.log("fsal :: workspace metadata saved to", path);
		return true;
	}

	getWorkspaceMetadataPath(workspacePath:string):string {
		return pathlib.join(workspacePath, ".typeright", "workspace.json");
	}

	// == FILE / DIR UNLOADING ========================== //

	unloadAll():void {
		for(let p of Object.keys(this._state.fileTree)){
			this._watchdog.unwatch(p);
		}

		this._state.fileTree = [];
		this._state.openFiles = [];
		this._state.activeFile = null;

		this.emit(FsalEvents.STATE_CHANGED, 'filetree')
		this.emit(FsalEvents.STATE_CHANGED, 'openFiles')
		this.emit(FsalEvents.STATE_CHANGED, 'openDirectory')
		this.emit(FsalEvents.STATE_CHANGED, 'activeFile')
	}

	// == WORKSPACE ===================================== //

	/**
	 * Set the current working directory.
	 * @param dir Any valid root directory.
	 * @returns TRUE if successful, FALSE otherwise
	 * @emits fsal-state-changed
	 */
	async setWorkspaceDir(dir:IDirectory):Promise<boolean> {
		// unload previous workspace
		this.closeWorkspace();
		this.unloadAll();

		// load (possibly stale) workspace metadata from file
		let metaPath = this.getWorkspaceMetadataPath(dir.path);
		let metadata:WorkspaceMeta|null = await this.loadWorkspaceMetadataFromFile(metaPath);
		if(!metadata){ metadata = new WorkspaceMeta(); }
		this._workspace = { dir, metadata, metaPath };

		// watch workspace directory
		this._watchdog.watch(dir.path);
		
		// check for changes between current file list and saved metadata,
		// and process added/changed/deleted files if needed
		let success:boolean = await this.updateWorkspace();
		return success;
	}

	async closeWorkspace(persist=true):Promise<boolean> {
		if(!this._workspace){ return true; }

		// unwatch files
		this._watchdog.unwatch(this._workspace.dir.path);

		// persist workspace metadata
		let success = (!persist) || await this.writeWorkspaceMetadata();

		if (this._workspace) {
			delete this._workspace.metadata;
			delete this._workspace.dir;
			this._workspace = null;
		}

		return success;
	}

	async updateWorkspace():Promise<boolean>{
		if(!this._workspace){ throw new Error("fsal :: cannot refresh! no workspace exists!"); }
		
		// restore plugin state (must happen first,
		// so that plugins can react to file changes)
		if(this._workspace.metadata.plugins){
			for(let plugin of this._workspacePlugins){
				let data:string = this._workspace.metadata.plugins[plugin.provider_name];
				if(data){ plugin.deserialize(data); }
			}
		}

		// check for changes between workspace state and files on disk
		let currentFiles = FSALDir.getFlattenedFiles(this._workspace.dir);
		let fileChanges = this._workspace.metadata.compareFiles(currentFiles);

		// handle deletions
		for (let hash of fileChanges.deleted) {
			// get file metadata
			let file = this._workspace.metadata.files[hash];
			this.handleWorkspaceFileDeleted(file);
		}

		// handle creations
		for (let hash of fileChanges.added) {
			// get file metadata
			let file: IFileMeta = currentFiles[hash];
			await this.handleWorkspaceFileCreated(file);
		}

		// handle changes
		for (let hash of fileChanges.changed) {
			// get file metadata
			let file: IFileMeta = currentFiles[hash];
			await this.handleWorkspaceFileChanged(file);
		}

		// write updated workspace data to disk
		let success = await this.writeWorkspaceMetadata();
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
		return success;
	}


	/**
	 * Called when a file has been changed in the workspace folder.
	 * @param file Metadata for the deleted file.
	 */
	handleWorkspaceFileDeleted(file:{path:string, hash:string}){
		if(!this._workspace){ return; }

		/** @todo (6/19/20) determine if file actually belongs to workspace? */

		// notify plugins
		for (let plugin of this._workspacePlugins) {
			plugin.handleFileDeleted(file.path, file.hash);
		}
		// remove file metadata
		delete this._workspace.metadata.files[file.hash];
	}

	/**
	 * Called when a file has been created in the workspace folder.
	 * Parses file contents and notifies plugins of the change.
	 * @param file The up-to-date file metadata.
	 */
	async handleWorkspaceFileCreated(file: { path: string, hash: string }) {
		if (!this._workspace) { return; }

		/** @todo (6/19/20) determine if file actually belongs to workspace? */

		// read file contents
		let contents = readFile(file.path);
		if(contents === null){
			throw new Error(`fsal :: handleWorkspaceFileCreated() :: error reading file :: ${file.path}`);
		}
		// parse file contents and notify plugins
		/** @todo (6/19/20) support wikilinks for other file types */
		let ext:string = pathlib.extname(file.path);
		if(ext == ".md" || ext == ".txt"){
			let doc = markdownParser.parse(contents);
			for (let plugin of this._workspacePlugins) {
				plugin.handleFileCreated(file.path, file.hash, doc);
			}
		}
		// add to workspace
		await this._workspace.metadata.updatePath(file.path);
	}

	/**
	 * Called when a file has been changed in the workspace folder.
	 * Parses file contents and notifies plugins of the change.
	 * @param file The up-to-date file metadata.
	 */
	async handleWorkspaceFileChanged(file: { path: string, hash: string }) {
		if (!this._workspace) { return; }

		/** @todo (6/19/20) determine if file actually belongs to workspace? */

		// read file contents
		let contents = readFile(file.path);
		if (contents === null) {
			throw new Error(`fsal :: handleWorkspaceFileCreated() :: error reading file :: ${file.path}`);
		}
		// parse file contents and notify plugins
	/** @todo (6/19/20) support wikilinks for other file types */
		let ext: string = pathlib.extname(file.path);
		if (ext == ".md" || ext == ".txt") {
			let doc = markdownParser.parse(contents);
			for (let plugin of this._workspacePlugins) {
				plugin.handleFileChanged(file.path, file.hash, doc);
			}
		}
		// add to workspace
		await this._workspace.metadata.updatePath(file.path);
	}

	/**
	 * Get the current working directory.
	 */
	getWorkspaceDir():(IDirectory|null){
		return this._workspace && this._workspace.dir;
	}

	registerWorkspacePlugin(plugin:WorkspaceProvider){
		this._workspacePlugins.push(plugin);
	}

	unregisterWorkspacePlugin(plugin:WorkspaceProvider){
		let index = this._workspacePlugins.indexOf(plugin);
		if(index > -1){
			this._workspacePlugins.splice(index, 1);
		}
	}

	// == OPEN/CLOSE FILES ============================== //

	/** 
	 * Add a file to the list of currently open files.
	 * @param file the file descriptor
	 * @returns FALSE if the file was already open, else TRUE
	 * @emits fsal-state-changed
	 */
	openFile(file:IFileDesc):boolean {
		if(this._state.openFiles.includes(file)){ return false; }
		console.log("fsal :: opening file", file.path);
		this._state.openFiles.push(file);
		this.emit(FsalEvents.STATE_CHANGED, "openFiles")
		return true;
	}

	/** 
	 * Close a file that is currently open.
	 * @param file The file to close.
	 * @returns TRUE if successful, FALSE otherwise
	 * @emits fsal-state-changed
	 */
	closeFile(file:IFileDesc):boolean {
		if(this._state.openFiles.includes(file)){
			console.log("fsal :: closing file", file.path);
			this._state.openFiles.splice(this._state.openFiles.indexOf(file), 1)
			this.emit(FsalEvents.STATE_CHANGED, 'openFiles')
			return true;
		} else {
			return false;
		}
	}

	getOpenFiles():FileHash[] {
		return this._state.openFiles.map(file => file.hash);
	}

	getOpenFileByHash(hash:FileHash):(IFileDesc|null) {
		return this._state.openFiles.find(file => (file.hash == hash)) || null;
	}

	getFileByHash(hash:string):(IFileMeta|null) {
		if(!this._workspace){ return null; }
		return this._workspace.metadata.getFileByHash(hash);
	}

	// == ACTIVE FILE =================================== //

	/**
	 * Set the currently active file.
	 * @returns TRUE if successful, FALSE otherwise
	 */
	setActiveFile(hash:FileHash):boolean {
		// get file associated with hash
		let file = this.getOpenFileByHash(hash);
		if(!file){
			console.error("fsal :: setActiveFile() :: failed, no open file with hash", hash);
			return false;
		}

		// mark active
		this._state.activeFile = file;
		this.emit(FsalEvents.STATE_CHANGED, "activeFile");
		return true;
	}

	getActiveFile():(IFileDesc|null) {
		return this._state.activeFile;
	}

	// == FILE TREE ===================================== //

	getFileTree(): IDirEntryMeta[] {
		// handle empty workspace
		if(!this._workspace){ return []; }

		let result:IDirEntryMeta[] = [];
		/** @todo (6/20/20) implement workspace iterator */
		for(let hash of Object.keys(this._workspace.metadata.files)){
			let file = this._workspace.metadata.getFileByHash(hash);
			if(file !== null){ result.push(file); }
		}

		return result;
	}
}