import { ipcMain, dialog, IpcMainInvokeEvent, IpcMainEvent, shell } from "electron";
import { readFile, saveFile, IUntitledFile, IFileWithContents, IPossiblyUntitledFile, IDirEntry, IDirEntryMeta, IFileMeta } from "@common/fileio";
import App from "./app"
import { UserEvents, FsalEvents, FileEvents, MenuEvents, EditorEvents } from "@common/events";
import { RendererIpcHandlers } from "@renderer/RendererIPC";
import { senderFor } from "@common/ipc";
import hash from "@common/util/hash";

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

	constructor(app:App){
		this._app = app;
		this._initialized = false;

		this._eventHandlers = new MainIpcEventHandlers(this._app);
	}

	init(){
		if(this._initialized){ return; }
		console.log("MainIPC :: init()");

		ipcMain.handle("command", (evt: IpcMainInvokeEvent, key: MainIpcEvents, data: any) => {
			console.log(`MainIPC :: handling event :: ${key}`);
			return this.handle(key, data);
		});
		
		this._initialized = true;
	}

	handle<T extends MainIpcEvents>(name: T, data: Parameters<MainIpcEventHandlers[T]>[0]) {
		/** @remark (6/25/20) cannot properly type-check this call
		 *  without support for "correlated record types", see e.g.
		 *  (https://github.com/Microsoft/TypeScript/issues/30581)
		 */
		return this._eventHandlers[name](data as any);
	}
}

////////////////////////////////////////////////////////////

export class MainIpcEventHandlers {
	private _app: App;

	constructor(app: App) {
		this._app = app;
	}

	// -- Dialog File Save As --------------------------- //

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
		app._renderProxy?.fileDidSave({ saveas: true, path: newFilePath});
		return newFilePath;
	}

	// -- Request File Save ----------------------------- //

	async requestFileSave(file: IFileWithContents): Promise<boolean> {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;

		if (!app.window) { return false; }

		saveFile(file.path, file.contents);
		// TODO: send success/fail back to renderer?
		app._renderProxy?.fileDidSave({saveas: false, path: file.path });
		return true;
	}

	// -- Ask Save/Discard Changes ---------------------- //

	async askSaveDiscardChanges(filePath: string): Promise<boolean> {
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

	// -- Request External Link Open ----------------- //

	async requestExternalLinkOpen(url: string) {
		shell.openExternal(url, { activate: true });
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
		let fileMeta: IFileMeta | null;
		if (hash === undefined || !(fileMeta = app._fsal.getFileByHash(hash))) {
			/** @todo (6/20/20) load from arbitrary path */
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

		app._renderProxy?.fileDidOpen(file);
	}

	// -- Request Tag Open ------------------------- //

	requestTagOpen(data:{tag: string, create:boolean}) {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;
		if (!app.window) { return; }

		// get files which define this tag
		let defs: string[] = app.getDefsForTag(data.tag);

		if (defs.length == 0) {
			/** @todo (6/20/20) create file for this tag when none exists */
			return;
		} else if (defs.length > 1) {
			/** @todo (6/20/20) handle more than one defining file for tag */
			return
		}

		// load file from hash
		this.requestFileOpen({ hash: defs[0] });
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
		// if no path selected, do nothing
		if (!filePaths || !filePaths.length) return;

		// load file from path
		this.requestFileOpen({ path: filePaths[0] })
	}

	// -- File Tree Changed ----------------------------- //

	fileTreeChanged(fileTree: IDirEntryMeta[]) {
		// `this` will always be bound to a MainIPC instance
		const app = this._app;
		if (!app.window) { return; }

		app._renderProxy?.filetreeChanged(fileTree);
	}

	// -- Show Notification ----------------------------- //

	showNotification(msg: string) {
		/** @todo (6/26/20) implement notifications */
	}

	showError(msg: string) {
		/** @todo (6/26/20) implement error notifications */
	}
}

export type MainIpcEvents = keyof MainIpcEventHandlers;