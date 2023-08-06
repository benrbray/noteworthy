// project imports
import { FSAL } from "@main/fsal/fsal";
import { IDirectory, IFileMeta, IDirEntryMeta, getFileMetadata, IFileDesc } from "@common/files";
import { WorkspacePlugin } from "@main/plugins/plugin";
import { CrossRefPlugin } from "@main/plugins/crossref-plugin";
import { IWorkspaceData, Workspace } from "./workspace";

// node.js imports
import * as pathlib from "path";
import { EventEmitter } from "events";
import { FsalEvents, ChokidarEvents } from "@common/events";
import { OutlinePlugin } from "@main/plugins/outline-plugin";
import { MetadataPlugin } from "@main/plugins/metadata-plugin";
import { CitationPlugin } from "@main/plugins/citation-plugin";

////////////////////////////////////////////////////////////

export enum WorkspaceEvent {
	FILETREE_CHANGED = "filetree-changed",
}

export class WorkspaceService extends EventEmitter {

	private _workspace:Workspace|null;

	constructor(private _fsal: FSAL) {
		super();

		// on startup, there is no workspace open
		this._workspace = null;

		// events
		this.handleChokidarEvent = this.handleChokidarEvent.bind(this);
		this._fsal.addListener(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent);
	}

	// == Directory ===================================== //

	getWorkspaceDir(): (IDirectory | null) {
		return this._workspace && this._workspace.dir;
	}

	async setWorkspaceDir(dirPath:string):Promise<boolean>{
		console.log("app :: setWorkspaceDir() ::", dirPath);
		// close active workspace
		this.closeWorkspace();

		// define plugins
		let plugins: WorkspacePlugin[] = [
			new CrossRefPlugin(),
			new OutlinePlugin(),
			new MetadataPlugin(),
			new CitationPlugin()
		];

		// get directory info
		/** @todo (9/12/20) replace static call with "FsalService" object
		 * > might help to make dependencies more clear
		 * > more mockable
		 */
		let dir:IDirectory = await this._fsal.parseDir(dirPath);

		// load (possibly stale) workspace metadata from file
		/** @todo (9/12/20) replace static call with "WorkspaceService" object
		 * > might help to make dependencies more clear
		 * > more mockable
		 */
		this._workspace = await this.loadWorkspaceFromDir(dir, plugins, true);
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
		/** @todo (9/13/20) type-checked workspace events */
		this.emit(WorkspaceEvent.FILETREE_CHANGED, this.getFileTree());
		return true === result;
	}

	/**
	 * @returns The active workspace.
	 */
	get workspace():Workspace|null {
		return this._workspace;
	}

	/**
	 * Closes the active workspace.
	 *
	 * @caution Attempting to use the workspace object after
	 *     it has been closed may result in mysterious bugs.
	 */
	async closeWorkspace(persist:boolean = true): Promise<boolean> {
		if(!this._workspace){ return true; }

		// persist workspace?
		if(persist) { this.writeJSON(); }

		// close workspace
		this._workspace.dispose();
		this._workspace = null;
		return true;
	}

	// == Load Workspace from Disk ====================== //

	/**
	 * Load a workspace from the given folder.  Uses the hidden `.noteworthy`
	 * metadata folder if it exists, or optionally creates it if missing.
	 *
	 * @param dir The directory to open.
	 * @param plugins A list of workspace plugins, which will be
	 *   notified of any changes to files in the workspace.
	 * @param create If TRUE and no data folder found, a
	 *   new workspace will be created for this directory.
	 */
	private async loadWorkspaceFromDir(dir:IDirectory, plugins:WorkspacePlugin[], create:boolean = false):Promise<Workspace|null> {
		// restore existing workspace if data folder is present
		let workspace = await this.loadWorkspaceFromPath(dir.path, plugins);
		if(!workspace && !create){ return null; }
		// create new workspace from directory
		return workspace || new Workspace(dir, undefined, plugins, this, this._fsal);
	}

	private async loadWorkspaceFromPath(workspacePath:string, plugins:WorkspacePlugin[]):Promise<Workspace|null> {
		// read workspace data from file
		let contents = this._fsal.readFile(Workspace.getDataPath(workspacePath));
		if(!contents){ return null; }
		// parse workspace data
		return this.loadWorkspaceFromJSON(workspacePath, contents, plugins);
	}

	private async loadWorkspaceFromJSON(workspacePath:string, json: string, plugins: WorkspacePlugin[]): Promise<Workspace | null> {
		/** @todo (6/27/20) validate incoming workspace/plugin json */
		let data: IWorkspaceData = JSON.parse(json);
		/** @todo (2/27/20) handle renamed workspace path */
		if(data.path !== undefined && workspacePath !== data.path){
			throw new Error("workspace path does not match path in data folder");
		}

		// get directory info
		let dir: IDirectory = await this._fsal.parseDir(workspacePath);

		if (!data.pluginData || !data.files) {
			console.error("Workspace.fromJSON() :: invalid data :: creating fresh workspace");
			/* TODO (2021/07/22) should this receive a list of plugins? */
			return new Workspace(dir, {}, [], this, this._fsal);
		}

		// deserialize plugins
		let pluginState:any;
		for(let plugin of plugins){
			if(pluginState = data.pluginData[plugin.plugin_name]){
				/* TODO (2021/07/22) what if deserialization fails? */
				plugin.deserialize(pluginState);
			}
		}

		// construct workspace
		return new Workspace(dir, data.files, plugins, this, this._fsal);
	}

	// == Events ======================================== //

	async updatePath(filePath: string): Promise<IFileMeta | null> {
		if(!this._workspace) { return null; }

		/** @todo (6/19/20) check if path is a directory? */
		let file: IFileDesc | null = await this._fsal.parseFile(filePath);
		if (file === null) { return null; }

		// store file info in workspace
		let fileMeta: IFileMeta = getFileMetadata(file);
		this._workspace.updatePath(fileMeta);
		return fileMeta;
	}

	async handleChokidarEvent(event: ChokidarEvents, info: { path: string }): Promise<void> {
		console.log(`workspace-service :: chokidar-event :: ${event}`, info.path);
		// handle errors
		if (event == ChokidarEvents.ERROR) { throw new Error(`app :: chokidar error :: ${info}`); }
		/** @todo (6/19/20) what to do about file changes outside workspace? */
		/** @todo (6/19/20) what to do about file changes when no workspace active? */
		await this.workspace?.handleChangeDetected(event, info);
		// file tree changed
		this.emit(WorkspaceEvent.FILETREE_CHANGED, this.getFileTree());
	}

	// == Workspace Persistence ========================= //

	/**
	 * Save information about the current workspace to a file,
	 * so the workspace can be closed and restored later.
	 */
	async writeJSON(): Promise<boolean> {
		if(!this._workspace) { return false; }

		let dataPath: string = this._workspace.dataPath;
		let success = await this._fsal.saveFile(dataPath, this._workspace.toJSON(), true);

		if(success) { console.log("fsal :: workspace metadata saved to", dataPath); }
		else        { console.error("fsal :: problem writing workspace metadata", dataPath); }

		return success;
	}

	// == Files / Paths ================================= //

	async createFile(path:string, contents:string=""): Promise<IFileMeta|null> {
		/** @todo (6/26/20) check if path in workspace? */
		return this._fsal.createFile(path, contents)
			.then(
				() => { return this.updatePath(path)||null; },
				(reason) => { console.error("error creating file", reason); return null; }
			)
	}

	getFileByHash(hash: string): (IFileMeta | null) {
		if (!this._workspace) { return null; }
		return this._workspace.getFileByHash(hash);
	}

	getFileTree(): IDirEntryMeta[] {
		// handle empty workspace
		if (!this._workspace) { return []; }
		return this._workspace.getFileTree();
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

}
