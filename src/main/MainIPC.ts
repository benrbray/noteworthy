// electron imports
import { dialog, shell } from "electron";

// node imports
import * as pathlib from "path";

// noteworthy imports
import FSAL from "./fsal/fsal";
import NoteworthyApp from "./app"
import { readFile, saveFile, IFileWithContents, IPossiblyUntitledFile, IDirEntryMeta, IFileMeta } from "@common/fileio";
import { DialogSaveDiscardOptions } from "@common/dialog";
import { to } from "@common/util/to";
import { filterNonVoid } from "@common/util/non-void";
import { WorkspaceService } from "./workspace/workspace-service";
import { ThemeService } from "./theme/theme-service";
import { PluginService } from "./plugins/plugin-service";
import { IOutline } from "./plugins/outline-plugin";
import { ITagSearchResult, SearchResult, IFileSearchResult, IHashSearchResult, CrossRefPlugin } from "./plugins/crossref-plugin";
import { WorkspacePlugin } from "./plugins/plugin";
import { IMetadata } from "./plugins/metadata-plugin";

////////////////////////////////////////////////////////////

/** @todo (7/12/20) move to separate file (duplicated in ipc.ts right now) */
type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];
type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

//// LIFECYCLE /////////////////////////////////////////////

export class MainIpc_LifecycleHandlers {
	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(private _app:NoteworthyApp){ }

	// -- Quit ------------------------------------------ //

	async requestAppQuit():Promise<void>{
		/** @todo (7/12/20) handle multiple windows? multiple files open? */
		if(this._app._renderProxy){
			// attempt to close active editors/windows
			let [err, result] = await to<string>(this._app._renderProxy.requestClose());
			// ok if promise rejects because user cancelled shutdown
			if(err == "Cancel"){ return; }
			// anything else is an error
			else if(err){ return Promise.reject(err); }
		}
		// close app
		this._app.quit();
	}
}

//// FILE SYSTEM ///////////////////////////////////////////

export class MainIpc_FileHandlers {
	constructor(
		private _app:NoteworthyApp,
		private _fsal:FSAL,
		private _workspaceService:WorkspaceService
	){ }

	// -- Request File Create --------------------------- //

	async requestFileCreate(path:string, contents:string=""):Promise<IFileMeta|null> {
		/** @todo (6/26/20) check if path in workspace? */
		return this._fsal.createFile(path, contents)
			.then(
				() => { return this._workspaceService.workspace?.updatePath(path)||null; },
				(reason) => { console.error("error creating file", reason); return null; }
			)
	}

	// -- Request File Save ----------------------------- //

	async requestFileSave(file: IFileWithContents): Promise<boolean> {
		if (!this._app.window) { return false; }

		saveFile(file.path, file.contents);
		/** @todo (7/12/20) check for file save errors? */
		this._app._renderProxy?.fileDidSave({saveas: false, path: file.path });
		return true;
	}

	// -- Request File Open ----------------------------- //

	async requestFileContents(fileInfo: { hash?: string, path?: string }):Promise<IFileWithContents|null> {
		let { hash, path } = fileInfo;
		// validate input
		if (hash === undefined && path === undefined) {
			throw new Error("MainIPC :: requestFileContents() :: no file path or hash provided");
		}

		// load from hash
		let fileMeta: IFileMeta | null;
		if (hash === undefined || !(fileMeta = this._workspaceService.getFileByHash(hash))) {
			/** @todo (6/20/20) load from arbitrary path */
			console.log(hash, hash && this._workspaceService.getFileByHash(hash));
			throw new Error("file loading from arbitrary path not implemented");
		}

		// read file contents
		const fileContents: string | null = readFile(fileMeta.path);
		if (fileContents === null) { throw new Error("MainIPC :: failed to read file"); }

		let file: IFileWithContents = {
			parent: null,
			contents: fileContents,
			...fileMeta
		}

		return file;
	}

	async requestFileOpen(fileInfo: { hash?: string, path?: string }):Promise<void> {
		if (!this._app.window) { return; }
		let file = await this.requestFileContents(fileInfo);
		if(file) { this._app._renderProxy?.fileDidOpen(file); }
	}
}

//// DIALOG ////////////////////////////////////////////////

export class MainIpc_DialogHandlers {
	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(
		private _app:NoteworthyApp,
		private _workspaceService:WorkspaceService,
		private _fileHandlers:MainIpc_FileHandlers
	){ }

	// -- Show Notification ----------------------------- //

	showNotification(msg: string) {
		/** @todo (6/26/20) implement notifications */
	}

	showError(msg: string) {
		/** @todo (6/26/20) implement error notifications */
	}

	// -- Request Folder Open --------------------------- //

	dialogFolderOpen() {
		if (!this._app.window) { return; }

		// open file dialog
		const dirPaths: string[] | undefined = dialog.showOpenDialogSync(
			this._app.window.window,
			{
				properties: ['openDirectory', 'createDirectory'],
				//filters: FILE_FILTERS
			}
		);
		if (!dirPaths || !dirPaths.length) return;

		this._workspaceService.setWorkspaceDir(dirPaths[0]);
	}

	// -- Request File Open ----------------------------- //

	dialogFileOpen() {
		if (!this._app.window) { return; }

		// open file dialog
		const filePaths: string[] | undefined = dialog.showOpenDialogSync(
			this._app.window.window,
			{
				properties: ['openFile'],
				//filters: FILE_FILTERS
			}
		);
		// if no path selected, do nothing
		if (!filePaths || !filePaths.length) return;

		// load file from path
		this._fileHandlers.requestFileOpen({ path: filePaths[0] })
	}

	// -- Dialog File Save As --------------------------- //

	async dialogFileSaveAs(file: IPossiblyUntitledFile): Promise<string | null> {
		if (!this._app.window) { return null; }

		const newFilePath: string | undefined = dialog.showSaveDialogSync(
			//TODO: better default "save as" path?
			this._app.window.window,
			{
				defaultPath: file.path || "",
				//filters: FILE_FILTERS
			}
		);
		if (!newFilePath) return null;
		saveFile(newFilePath, file.contents);

		// send new file path to renderer
		this._app._renderProxy?.fileDidSave({ saveas: true, path: newFilePath});
		return newFilePath;
	}

	// -- Ask Save/Discard Changes ---------------------- //

	/** @todo (7/12/20) better return type? extract array type? **/
	async askSaveDiscardChanges(filePath: string): Promise<typeof DialogSaveDiscardOptions[number]> {
		if (!this._app.window) { throw new Error("no window open! cannot open dialog!"); }
		let response = await dialog.showMessageBox(this._app.window.window, {
			type: "warning",
			title: "Warning: Unsaved Changes",
			message: `File (${filePath}) contains unsaved changes.`,
			buttons: Array.from(DialogSaveDiscardOptions),
			defaultId: DialogSaveDiscardOptions.indexOf("Save"),
			cancelId: DialogSaveDiscardOptions.indexOf("Cancel"),
		})
		return DialogSaveDiscardOptions[response.response];
	}
}

////////////////////////////////////////////////////////////


export class MainIpc_ThemeHandlers {
	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(private _themeService:ThemeService){ }

	async requestThemeRefresh() {
		this._themeService.setTheme();
	}
}

export class MainIpc_TagHandlers {
	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(
		private _app:NoteworthyApp,
		private _workspaceService:WorkspaceService,
		private _pluginService:PluginService,
		private _fileHandlers:MainIpc_FileHandlers
	){ }
	
	async tagSearch(query:string):Promise<IFileMeta[]> {
		// get active plugin
		let plugin = this._pluginService.getWorkspacePluginByName("crossref_plugin");
		if(!plugin){ return []; }
		// tag search
		const hashes:string[]|null = plugin.getTagMentions(query);
		if(hashes === null){ return []; }
		return filterNonVoid( hashes.map(hash => (this._workspaceService.getFileByHash(hash))) );
	}

	async fuzzyTagSearch(query:string):Promise<ITagSearchResult[]> {
		// get active plugin
		let plugin = this._pluginService.getWorkspacePluginByName("crossref_plugin");
		if(!plugin){ return []; }
		// tag search
		return plugin.fuzzyTagSearch(query);
	}

	async fuzzyTagFileSearch(query:string):Promise<(ITagSearchResult|IFileSearchResult)[]> {
		// get active plugin
		let maybePlugin = this._pluginService.getWorkspacePluginByName("crossref_plugin");
		if(!maybePlugin){ return []; }
		let plugin:CrossRefPlugin = maybePlugin;

		// fuzzy tag search
		let tagResults:ITagSearchResult[] = plugin.fuzzyTagSearch(query);

		// find all documents which mention one of the matching tags
		let fileHashes = new Set<string>();
		
		// get unique hashes for files mentioning this tag
		tagResults
			.flatMap( result => plugin.getTagMentions(result.result) )
			.forEach( hash => fileHashes.add(hash) );

		
		let docResults:IFileSearchResult[] = [];
		fileHashes.forEach( hash => {
			let fileMeta:IFileMeta | null = this._workspaceService.getFileByHash(hash);
			if(fileMeta !== null){
				docResults.push({ type: "file-result", file: fileMeta });
			}
		});
		
		let results:(IFileSearchResult|ITagSearchResult)[] = [];
		return results.concat(tagResults, docResults);
	}

	async getHashForTag(data: { tag: string, create: boolean, directoryHint?:string }):Promise<string|null> {
		// get active plugin
		let plugin = this._pluginService.getWorkspacePluginByName("crossref_plugin");
		if(!plugin){ return null; }

		// get files which define this tag
		let defs: string[] | null = plugin.getDefsForTag(data.tag);
		let fileHash: string;

		if (defs == null) {
			// expect NULL when no crossref plugin active
			console.error("crossref plugin not active")
			return null;
		} else if (defs.length == 0) {
			// create a file for this tag when none exists?
			if (!data.create) { return null; }
			console.log(`MainIPC :: creating file for tag '${data.tag}'`);

			/** @todo (6/27/20)
			 * what if data.tag is not a valid file name?
			 * what if it contains slashes?  what if it uses \ instead of /?
			 */

			// create file for this tag when none exists
			let fileName: string = data.tag + ".md";

			// determine new file path for this file
			/** @todo (7/30/20) check for errors:
			 * > what if path points to file that already exists?
			 * > what if directoryHint is relative, not absolute?
			 * > user setting to ignore directory hints
			 */
			let filePath: string | null;
			if(data.directoryHint){ filePath = pathlib.join(data.directoryHint, fileName) }
			else {                  filePath = this._workspaceService.resolveWorkspaceRelativePath(fileName); }

			if (!filePath) {
				console.error("MainIPC :: could not create file for tag, no active workspace");
				return null;
			}

			// create file
			/** @todo (9/14/20) default file creation should probably be handled by the WorkspaceService */
			let fileContents: string = this._app.getDefaultFileContents(".md", fileName)
			let file: IFileMeta | null = await this._fileHandlers.requestFileCreate(filePath, fileContents);
			if (!file) {
				console.error("MainIPC :: unknown error creating file for tag");
				return null;
			}

			// set hah
			fileHash = file.hash;
		} else if (defs.length == 1) {
			fileHash = defs[0];
		} else {
			/** @todo (6/20/20) handle more than one defining file for tag */
			return null;
		}

		return fileHash;
	}

	async getFileForTag(data: { tag: string, create: boolean }):Promise<IFileMeta|null> {
		let fileHash = await this.getHashForTag(data);
		if (!fileHash) return null;
		return this._workspaceService.getFileByHash(fileHash);
	}

	async requestTagOpen(data:{tag: string, create:boolean, directoryHint?:string}):Promise<void> {
		if (!this._app.window) { return; }

		// get files which define this tag
		let fileHash = await this.getHashForTag(data);
		if(!fileHash) return;
		// load file from hash
		this._fileHandlers.requestFileOpen({ hash: fileHash });
	}
}

//// OUTLINE ///////////////////////////////////////////////

export class MainIpc_OutlineHandlers {
	constructor(
		private _pluginService:PluginService
	) { }

	async requestOutlineForHash(hash: string): Promise<IOutline | null> {
		// get active plugin
		let plugin = this._pluginService.getWorkspacePluginByName("outline_plugin");
		if(!plugin){ return []; }
		// get outline
		return plugin.getOutlineForHash(hash);
	}
}

//// SHELL /////////////////////////////////////////////////

export class MainIpc_ShellHandlers {
	constructor() { }

	async requestExternalLinkOpen(url: string) {
		shell.openExternal(url, { activate: true });
	}
}

//// PLUGINS ///////////////////////////////////////////////

export class MainIpc_MetadataHandlers {
	constructor(
		private _pluginService: PluginService
	) { }

	async getMetadataForHash(hash: string): Promise<IMetadata|null> {
		let plugin = this._pluginService.getWorkspacePluginByName("metadata_plugin");
		if(!plugin){ console.error("no plugin!"); return null; }
		console.log(`getMetadataForHash :: ${hash}`);
		return plugin.getMetadataForHash(hash);
	}
}

////////////////////////////////////////////////////////////

export interface MainIpcHandlers {
	lifecycle: MainIpc_LifecycleHandlers;
	file:      MainIpc_FileHandlers;
	theme:     MainIpc_ThemeHandlers;
	shell:     MainIpc_ShellHandlers;
	dialog:    MainIpc_DialogHandlers;
	// plugins
	/** @todo Custom plugins won't be able to add their own
	 * handlers to this file, so there needs to be a standard
	 * way to request plugin data from the render process */
	tag:       MainIpc_TagHandlers;
	outline:   MainIpc_OutlineHandlers;
	metadata:  MainIpc_MetadataHandlers;
};

export type MainIpcChannel = keyof MainIpcHandlers;

export type MainIpcEvents = {
	[K in MainIpcChannel] : FunctionPropertyNames<MainIpcHandlers[K]>
}