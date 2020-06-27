import { dialog, shell } from "electron";
import { readFile, saveFile, IFileWithContents, IPossiblyUntitledFile, IDirEntryMeta, IFileMeta } from "@common/fileio";
import App from "./app"

////////////////////////////////////////////////////////////

type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];
type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

////////////////////////////////////////////////////////////

export class MainIpcHandlers {
	private _app: App;

	constructor(app: App) {
		this._app = app;
	}

	//// DIALOGS ///////////////////////////////////////////

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

		this._app.setWorkspaceDir(dirPaths[0]);
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
		this.requestFileOpen({ path: filePaths[0] })
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

	async askSaveDiscardChanges(filePath: string): Promise<boolean> {
		if (!this._app.window) { return false; }
		let response = await dialog.showMessageBox(this._app.window?.window, {
			type: "warning",
			title: "Warning: Unsaved Changes",
			message: `File (${filePath}) contains unsaved changes.`,
			buttons: ["Cancel", "Save"],
			defaultId: 1,
			cancelId: 0
		})
		return (response.response == 1);
	}

	//// FILES /////////////////////////////////////////////

	// -- Request File Save ----------------------------- //

	async requestFileSave(file: IFileWithContents): Promise<boolean> {
		if (!this._app.window) { return false; }

		saveFile(file.path, file.contents);
		// TODO: send success/fail back to renderer?
		this._app._renderProxy?.fileDidSave({saveas: false, path: file.path });
		return true;
	}

	// -- Request File Open ----------------------------- //

	requestFileOpen(fileInfo: { hash?: string, path?: string }) {
		if (!this._app.window) { return; }

		let { hash, path } = fileInfo;
		// validate input
		if (hash === undefined && path === undefined) {
			throw new Error("MainIPC :: requestFileOpen() :: no file path or hash provided");
		}

		// load from hash
		let fileMeta: IFileMeta | null;
		if (hash === undefined || !(fileMeta = this._app._fsal.getFileByHash(hash))) {
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

		this._app._renderProxy?.fileDidOpen(file);
	}
	
	//// FILETREE //////////////////////////////////////////

	// -- File Tree Changed ----------------------------- //

	fileTreeChanged(fileTree: IDirEntryMeta[]) {
		if (!this._app.window) { return; }

		this._app._renderProxy?.filetreeChanged(fileTree);
	}

	//// TAGS //////////////////////////////////////////////

	// -- Request External Link Open -------------------- //

	async requestExternalLinkOpen(url: string) {
		shell.openExternal(url, { activate: true });
	}

	// -- Request Tag Open ------------------------------ //

	requestTagOpen(data:{tag: string, create:boolean}) {
		if (!this._app.window) { return; }

		// get files which define this tag
		let defs: string[] = this._app.getDefsForTag(data.tag);

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
}

export type MainIpcEvents = keyof MainIpcHandlers;