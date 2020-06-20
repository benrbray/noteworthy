import { EventEmitter } from "events";
import fs from "fs";
import * as pathlib from "path";

// project imports
import { FileHash, IFileDesc, IDirectory, IDirEntry, IDirectoryMeta, readFile, WorkspaceMeta, IFileMeta, FileCmp, IWorkspaceDir } from "@common/fileio";
import isFile from "@common/util/is-file";
import isDir from "@common/util/is-dir";

// fsal imports
import FSALWatchdog from "./fsal-watcher";
import * as FSALFile from "./fsal-file";
import * as FSALDir from "./fsal-dir";
import { FsalEvents } from "@common/events";
import { WorkspaceProvider } from "@main/providers/provider";
import { markdownParser } from "@common/markdown";

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
		this._watchdog = new FSALWatchdog(projectDir);

		this._watchdog.on(FsalEvents.CHOKIDAR_EVENT, (event:string, info) => {
			console.log(`fsal :: chokidar-event :: ${event}`, info);
		});

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
	}

	// == EVENTS ======================================== //

	// == FILE / DIR LOADING ============================ //

	/**
	 * Opens, reads, and parses a file.
	 * @param filePath The file to be loaded.
	 * @emits fsal-state-changed (filetree)
	 */
	private async _loadFile(filePath:string):Promise<void> {
		let start:number = Date.now();
		let file:IFileDesc|null = await FSALFile.parseFile(filePath);
		if(!file){ return; }

		this._state.fileTree.push(file);
		console.log(`${Date.now() - start} ms: Loaded file ${filePath}`) // DEBUG
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
	}

	/**
	 * Loads the given directory recursively.
	 * @param dirPath The directory to be loaded.
	 * @emits fsal-state-changed (filetree)
	 */
	private async _loadDir(dirPath:string):Promise<void> {
		let start:number = Date.now();
		let dir:IDirectory = await FSALDir.parseDir(dirPath);
		this._state.fileTree.push(dir);
		console.log(`${Date.now() - start} ms: Loaded directory ${dirPath}`) // DEBUG
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
	}

	/**
	 * Loads the given file or directory.
	 * @param p The directory to be loaded.
	 * @emits fsal-state-changed (filetree)
	 * @returns TRUE when successfully loaded, FALSE otherwise
	 */
	async loadPath(p:string){
		if(isFile(p)){
			await this._loadFile(p);
			this._watchdog.watch(p);
		} else if (isDir(p)) {
			await this._loadDir(p);
			this._watchdog.watch(p);
		} else {
			// path is neiter a file nor a directory!
			return false;
		}

		this.emit(FsalEvents.STATE_CHANGED, "filetree");
		return true;
	}

	// -- Workspace Metadata ---------------------------- //

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
		
		// check for changes between current file list and saved metadata,
		// and process added/changed/deleted files if needed
		let success:boolean = await this.updateWorkspace();
		return success;
	}

	async closeWorkspace(persist=true):Promise<boolean> {
		if(!this._workspace){ return true; }

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
			await this.handleWorkspaceFileDeleted(file);
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
		return await this.writeWorkspaceMetadata();
	}


	/**
	 * Called when a file has been changed in the workspace.
	 * @param file Metadata for the deleted file.
	 */
	handleWorkspaceFileDeleted(file:IFileMeta){
		if(!this._workspace){ return; }
		// notify plugins
		for (let plugin of this._workspacePlugins) {
			plugin.handleFileDeleted(file);
		}
		// remove file metadata
		delete this._workspace.metadata.files[file.hash];
	}

	/**
	 * Called when a file has been created in the workspace.
	 * Parses file contents and notifies plugins of the change.
	 * @param file The up-to-date file metadata.
	 */
	handleWorkspaceFileCreated(file: IFileMeta) {
		if (!this._workspace) { return; }
		// read file contents
		let contents = readFile(file.path);
		if(contents === null){
			throw new Error(`fsal :: handleWorkspaceFileCreated() :: error reading file :: ${file.path}`);
		}
		// parse file contents and notify plugins
		if(file.ext == ".md" || file.ext == ".txt"){
			let doc = markdownParser.parse(contents);
			for (let plugin of this._workspacePlugins) {
				plugin.handleFileCreated(file, doc);
			}
		}
		// add to workspace
		this._workspace.metadata.files[file.hash] = file;
	}

	/**
	 * Called when a file has been changed in the workspace.
	 * Parses file contents and notifies plugins of the change.
	 * @param file The up-to-date file metadata.
	 */
	handleWorkspaceFileChanged(file: IFileMeta) {
		if (!this._workspace) { return; }
		// read file contents
		let contents = readFile(file.path);
		if (contents === null) {
			throw new Error(`fsal :: handleWorkspaceFileCreated() :: error reading file :: ${file.path}`);
		}
		// parse file contents and notify plugins
		if (file.ext == ".md" || file.ext == ".txt") {
			let doc = markdownParser.parse(contents);
			for (let plugin of this._workspacePlugins) {
				plugin.handleFileChanged(file, doc);
			}
		}
		// add to workspace
		this._workspace.metadata.files[file.hash] = file;
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

	getFileTree():IDirEntry[] {
		let result:IDirEntry[] = [];
		for(let root of this._state.fileTree){
			result.push(this.getMetadataFor(root));
		}

		return result;
	}

	getMetadataFor(dirEntry:IDirEntry):IDirEntry {
		return dirEntry;
	}
}