import { ipcMain, dialog } from "electron";
import { readFile, saveFile, IUntitledFile, IFileWithContents, IPossiblyUntitledFile, IDirEntry, IDirEntryMeta, IFileMeta } from "@common/fileio";
import App from "./app"
import { UserEvents, FsalEvents, FileEvents, MenuEvents, EditorEvents } from "@common/events";

export default class MainIPC {

	_app:App;
	_initialized:boolean;

	constructor(app:App){
		this._app = app;
		this._initialized = false;
	}

	init(){
		if(this._initialized){ return; }
		console.log("MainIPC :: init()");
		
		// DIALOG_FILE_OPEN
		ipcMain.on(UserEvents.DIALOG_FILE_OPEN, (evt:Event) => { 
			this.handle_dialogFileOpen();
		});
			
		// DIALOG_FILE_SAVEAS
		ipcMain.handle(UserEvents.DIALOG_FILE_SAVEAS, (evt: Event, file: IPossiblyUntitledFile) => {
			this.handle_dialogFileSaveAs(file);
			return file.path;
		});
		
		// REQUEST_FILE_SAVE
		ipcMain.handle(UserEvents.REQUEST_FILE_SAVE, (evt:Event, file: IFileWithContents) => {
			this.handle_requestFileSave(file);
			return file.path;
		});

		ipcMain.handle(EditorEvents.ASK_SAVE_DISCARD_CHANGES, async (evt:Event, filePath:string) => {
			if(!this._app.window) { return false; }
			let response = await dialog.showMessageBox(this._app.window?.window, {
				type : "warning",
				title: "Warning: Unsaved Changes",
				message : `File (${filePath}) contains unsaved changes.`,
				buttons: ["Cancel", "Save"],
				defaultId: 1,
				cancelId: 0
			})
			return (response.response == 1);
		})

		// REQUEST_FILE_OPEN_PATH
		ipcMain.on(UserEvents.REQUEST_FILE_OPEN_PATH, (evt: Event, filePath:string) => {
			this.handle_requestFileOpen({path: filePath});
		});

		// REQUEST_FILE_OPEN_HASH
		ipcMain.on(UserEvents.REQUEST_FILE_OPEN_HASH, (evt: Event, fileHash: string) => {
			this.handle_requestFileOpen({ hash: fileHash });
		});

		// REQUEST_TAG_OPEN
		ipcMain.on(UserEvents.REQUEST_TAG_OPEN, (evt: Event, tag: string) => {
			this.handle_requestTagOpen(tag);
		});
		
		this._initialized = true;
	}

	send(cmd: string, arg: any): void {
		console.log("MainIPC :: send ::", cmd, arg);

		switch (cmd) {
			case UserEvents.DIALOG_FILE_OPEN:
				this.handle_dialogFileOpen();
				break;
			case UserEvents.DIALOG_WORKSPACE_OPEN:
				this.handle_dialogFolderOpen();
				break;
			case UserEvents.DIALOG_FILE_SAVEAS:
				this.handle_dialogFileSaveAs(arg as IPossiblyUntitledFile);
				break;
			case UserEvents.REQUEST_FILE_SAVE:
				this.handle_requestFileSave(arg as IFileWithContents);
				break;
			case FsalEvents.FILETREE_CHANGED:
				this.handle_fileTreeChanged(arg as IDirEntryMeta[]);
				break;
			// -- Menu Events --------------------------- //
			case MenuEvents.MENU_FILE_SAVE:
				this._app.window?.window.webContents.send(MenuEvents.MENU_FILE_SAVE);
				break;
			case MenuEvents.MENU_FILE_SAVEAS:
				this._app.window?.window.webContents.send(MenuEvents.MENU_FILE_SAVEAS);
				break;
			default:
				break;
		}
	}

	// == Event Handlers ================================ //

	handle(cmd:string, arg: any){

	}

	private handle_requestFileOpen(fileInfo: { hash?: string, path?: string }) {
		if (!this._app.window) { return; }
		console.log("MainIPC :: REQUEST_FILE_OPEN");

		let { hash, path } = fileInfo;
		// validate input
		if(hash === undefined && path === undefined){
			throw new Error("MainIPC :: requestFileOpen() :: no file path or hash provided");
		}

		// load from hash
		let file:IFileMeta|null;
		if (hash === undefined || !(file=this._app._fsal.getFileByHash(hash))){
			/** @todo (6/20/20) load from arbitrary path */
			throw new Error("file loading from arbitrary path not implemented");
		}

		// read file contents
		const fileContents: string | null = readFile(file.path);
		if (fileContents === null) { throw new Error("MainIPC :: failed to read file"); }

		this._app.window.window.webContents.send(FileEvents.FILE_DID_OPEN, {
			path: file.path,
			contents: fileContents
		});
	}

	private handle_requestTagOpen(tag:string) {
		if (!this._app.window) { return; }
		console.log("MainIPC :: REQUEST_TAG_OPEN");

		// get files which define this tag
		let defs:string[] = this._app.getDefsForTag(tag);

		if(defs.length == 0){
			/** @todo (6/20/20) create file for this tag when none exists */
			return;
		} else if(defs.length > 1){
			/** @todo (6/20/20) handle more than one defining file for tag */
			return
		}

		// load file from hash
		let file: IFileMeta | null = this._app._fsal.getFileByHash(defs[0]);
		if(!file){ throw new Error("Error reading file!"); /** @todo implement */ }

		// read file contents
		/** @todo (6/20/20) this code is repeated several times
		 * in his file, so de-duplicate it
		 */
		const fileContents: string | null = readFile(file.path);
		if (fileContents === null) { throw new Error("MainIPC :: failed to read file"); }

		this._app.window.window.webContents.send(FileEvents.FILE_DID_OPEN, {
			path: file.path,
			contents: fileContents
		});
	}

	private handle_dialogFolderOpen(){
		if (!this._app.window) { return; }
		console.log("MainIPC :: DIALOG_FOLDER_OPEN");

		// open file dialog
		const dirPaths: string[] | undefined = dialog.showOpenDialogSync(
			this._app.window.window,
			{
				properties: ['openDirectory', 'createDirectory'],
				//filters: FILE_FILTERS
			}
		);
		if (!dirPaths || !dirPaths.length) return;

		this._app.setWorkspaceDir(dirPaths[0]);
	}

	private handle_dialogFileOpen(){
		if (!this._app.window) { return; }
		console.log("MainIPC :: DIALOG_OPEN");

		// open file dialog
		const filePaths: string[] | undefined = dialog.showOpenDialogSync(
			this._app.window.window,
			{
				properties: ['openFile'],
				//filters: FILE_FILTERS
			}
		);
		if (!filePaths || !filePaths.length) return;

		const fileContents:string|null = readFile(filePaths[0]);
		if(fileContents === null){
			throw new Error("MainIPC :: failed to read file");
		}

		console.log(filePaths[0]);
		this._app.window.window.webContents.send(FileEvents.FILE_DID_OPEN, {
			path: filePaths[0],
			contents: fileContents
		});
	}

	private handle_dialogFileSaveAs(file: IPossiblyUntitledFile):string|null {
		if (!this._app.window) { return null; }
		console.log("MainIPC :: DIALOG_SAVE_AS");

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
		// TODO: handle this event in renderer!!
		this._app.window.window.webContents.send(FileEvents.FILE_DID_SAVEAS, newFilePath);
		return newFilePath;
	}

	private handle_requestFileSave(file: IFileWithContents):boolean {
		if (!this._app.window) { return false; }

		console.log("MainIPC :: FILE_SAVE");
		saveFile(file.path, file.contents);
		// TODO: send success/fail back to renderer?
		return true;
	}

	private handle_fileTreeChanged(fileTree: IDirEntryMeta[]) {
		if (!this._app.window) { return; }

		console.log("MainIPC :: filetree-changed");

		this._app.window.window.webContents.send(FsalEvents.FILETREE_CHANGED, fileTree);
	}
}