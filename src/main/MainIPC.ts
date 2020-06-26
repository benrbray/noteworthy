import { ipcMain, dialog, IpcMainInvokeEvent, IpcMainEvent } from "electron";
import { readFile, saveFile, IUntitledFile, IFileWithContents, IPossiblyUntitledFile, IDirEntry, IDirEntryMeta, IFileMeta } from "@common/fileio";
import App from "./app"
import { UserEvents, FsalEvents, FileEvents, MenuEvents, EditorEvents } from "@common/events";

////////////////////////////////////////////////////////////

export class MainReceiver {
	dialogFileOpen(path:string, num:number) {

	}
}

type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];
type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

////////////////////////////////////////////////////////////

export default class MainIPC {

	_app:App;
	_initialized:boolean;

	_eventHandlers:MainIpcEventHandlers;
	_invokeHandlers:MainIpcInvokeHandlers;

	constructor(app:App){
		this._app = app;
		this._initialized = false;

		this._eventHandlers = new MainIpcEventHandlers(this._app);
		this._invokeHandlers = new MainIpcInvokeHandlers(this._app);
	}

	init(){
		if(this._initialized){ return; }
		console.log("MainIPC :: init()");

		ipcMain.on("command", (evt: IpcMainEvent, key: MainIpcEvents, data: any) => {
			console.log(`MainIPC :: handling event :: ${key}`);
			return this.dispatch(key, data);
		});

		ipcMain.handle("invokeCommand", (evt: IpcMainInvokeEvent, key: MainIpcInvokeEvents, data: any) => {
			console.log(`MainIPC :: handling event :: ${key}`);
			return this.handle(key, data);
		});
		
		this._initialized = true;
	}

	dispatch<T extends MainIpcEvents>(name: T, data: Parameters<MainIpcEventHandlers[T]>[0]) {
		/** @remark (6/25/20) cannot properly type-check this call
		 *  without support for "correlated record types", see e.g.
		 *  (https://github.com/Microsoft/TypeScript/issues/30581)
		 */
		return this._eventHandlers[name](data as any);
	}

	handle<T extends MainIpcInvokeEvents>(name: MainIpcInvokeEvents, data: Parameters<MainIpcInvokeHandlers[T]> [0]){
		/** @remark (6/25/20) cannot properly type-check this call
		 *  without support for "correlated record types", see e.g.
		 *  (https://github.com/Microsoft/TypeScript/issues/30581)
		 */
		return this._invokeHandlers[name](data as any);
	}

	send(cmd: string, arg: any): void {
		console.log("MainIPC :: send ::", cmd, arg);

		switch (cmd) {
			case UserEvents.DIALOG_FILE_OPEN:
				this._eventHandlers.dialogFileOpen.call(this);
				break;
			case UserEvents.DIALOG_WORKSPACE_OPEN:
				this._eventHandlers.dialogFolderOpen();
				break;
			case UserEvents.DIALOG_FILE_SAVEAS:
				this._invokeHandlers.dialogFileSaveAs(arg as IPossiblyUntitledFile);
				break;
			case UserEvents.REQUEST_FILE_SAVE:
				this._invokeHandlers.requestFileSave.call(this, arg as IFileWithContents);
				break;
			case FsalEvents.FILETREE_CHANGED:
				this._eventHandlers.fileTreeChanged.call(this, arg as IDirEntryMeta[]);
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
}

////////////////////////////////////////////////////////////

// == Event Handlers =================================== //

export class MainIpcInvokeHandlers {
	private _app:App;

	constructor(app:App){
		this._app = app;
	}

	async dialogFileSaveAs(file: IPossiblyUntitledFile): Promise<string | null> {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;

		if (!app.window) { return null; }

		const newFilePath: string | undefined = dialog.showSaveDialogSync(
			//TODO: better default "save as" path?
			app.window.window,
			{
				defaultPath: file.path || "",
				//filters: FILE_FILTERS
			}
		);
		if (!newFilePath) return null;
		saveFile(newFilePath, file.contents);

		// send new file path to renderer
		// TODO: handle this event in renderer!!
		app.window.window.webContents.send(FileEvents.FILE_DID_SAVEAS, newFilePath);
		return newFilePath;
	}

	async requestFileSave(file: IFileWithContents): Promise<boolean> {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;

		if (!app.window) { return false; }

		saveFile(file.path, file.contents);
		// TODO: send success/fail back to renderer?
		return true;
	}

	async askSaveDiscardChanges(filePath: string):Promise<boolean> {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;

		if (!app.window) { return false; }
		let response = await dialog.showMessageBox(app.window?.window, {
			type: "warning",
			title: "Warning: Unsaved Changes",
			message: `File (${filePath}) contains unsaved changes.`,
			buttons: ["Cancel", "Save"],
			defaultId: 1,
			cancelId: 0
		})
		return (response.response == 1);
	}
}

////////////////////////////////////////////////////////////

export class MainIpcEventHandlers {
	private _app: App;

	constructor(app: App) {
		this._app = app;
	}

	// -- Request File Open ------------------------- //

	requestFileOpen(fileInfo: { hash?: string, path?: string }) {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;
		if (!app.window) { return; }

		let { hash, path } = fileInfo;
		// validate input
		if (hash === undefined && path === undefined) {
			throw new Error("MainIPC :: requestFileOpen() :: no file path or hash provided");
		}

		// load from hash
		let file: IFileMeta | null;
		if (hash === undefined || !(file = app._fsal.getFileByHash(hash))) {
			/** @todo (6/20/20) load from arbitrary path */
			throw new Error("file loading from arbitrary path not implemented");
		}

		// read file contents
		const fileContents: string | null = readFile(file.path);
		if (fileContents === null) { throw new Error("MainIPC :: failed to read file"); }

		app.window.window.webContents.send(FileEvents.FILE_DID_OPEN, {
			path: file.path,
			contents: fileContents
		});
	}

	// -- Request Tag Open ------------------------- //

	requestTagOpen(tag: string) {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;
		if (!app.window) { return; }

		// get files which define this tag
		let defs: string[] = app.getDefsForTag(tag);

		if (defs.length == 0) {
			/** @todo (6/20/20) create file for this tag when none exists */
			return;
		} else if (defs.length > 1) {
			/** @todo (6/20/20) handle more than one defining file for tag */
			return
		}

		// load file from hash
		let file: IFileMeta | null = app._fsal.getFileByHash(defs[0]);
		if (!file) { throw new Error("Error reading file!"); /** @todo implement */ }

		// read file contents
		/** @todo (6/20/20) this code is repeated several times
		 * in his file, so de-duplicate it
		 */
		const fileContents: string | null = readFile(file.path);
		if (fileContents === null) { throw new Error("MainIPC :: failed to read file"); }

		app.window.window.webContents.send(FileEvents.FILE_DID_OPEN, {
			path: file.path,
			contents: fileContents
		});
	}

	// -- Request Tag Open Or Create -------------------- //

	requestTagOpenOrCreate(tag: string) {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;
		if (!app.window) { return; }

		// get files which define this tag
		let defs: string[] = app.getDefsForTag(tag);

		if (defs.length == 0) {
			/** @todo (6/20/20) create file for this tag when none exists */
			return;
		} else if (defs.length > 1) {
			/** @todo (6/20/20) handle more than one defining file for tag */
			return
		}

		// load file from hash
		let file: IFileMeta | null = app._fsal.getFileByHash(defs[0]);
		if (!file) { throw new Error("Error reading file!"); /** @todo implement */ }

		// read file contents
		/** @todo (6/20/20) this code is repeated several times
		 * in his file, so de-duplicate it
		 */
		const fileContents: string | null = readFile(file.path);
		if (fileContents === null) { throw new Error("MainIPC :: failed to read file"); }

		app.window.window.webContents.send(FileEvents.FILE_DID_OPEN, {
			path: file.path,
			contents: fileContents
		});
	}
	
	// -- Request Folder Open --------------------------- //

	dialogFolderOpen() {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;
		if (!app.window) { return; }

		// open file dialog
		const dirPaths: string[] | undefined = dialog.showOpenDialogSync(
			app.window.window,
			{
				properties: ['openDirectory', 'createDirectory'],
				//filters: FILE_FILTERS
			}
		);
		if (!dirPaths || !dirPaths.length) return;

		app.setWorkspaceDir(dirPaths[0]);
	}

	// -- Request File Open ----------------------------- //

	dialogFileOpen() {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;
		if (!app.window) { return; }

		// open file dialog
		const filePaths: string[] | undefined = dialog.showOpenDialogSync(
			app.window.window,
			{
				properties: ['openFile'],
				//filters: FILE_FILTERS
			}
		);
		if (!filePaths || !filePaths.length) return;

		const fileContents: string | null = readFile(filePaths[0]);
		if (fileContents === null) {
			throw new Error("MainIPC :: failed to read file");
		}

		console.log(filePaths[0]);
		app.window.window.webContents.send(FileEvents.FILE_DID_OPEN, {
			path: filePaths[0],
			contents: fileContents
		});
	}

	// -- File Tree Changed ----------------------------- //

	fileTreeChanged(fileTree: IDirEntryMeta[]) {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;
		if (!app.window) { return; }

		app.window.window.webContents.send(FsalEvents.FILETREE_CHANGED, fileTree);
	}
}

export type MainIpcEvents = keyof MainIpcEventHandlers;
export type MainIpcInvokeEvents = keyof MainIpcInvokeHandlers;