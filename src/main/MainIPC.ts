import { dialog, shell } from "electron";
import { readFile, saveFile, IFileWithContents, IPossiblyUntitledFile, IDirEntryMeta, IFileMeta } from "@common/fileio";
import NoteworthyApp from "./app"

////////////////////////////////////////////////////////////

type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];
type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

////////////////////////////////////////////////////////////

export class MainIpcHandlers {
	private _app: NoteworthyApp;

	constructor(app: NoteworthyApp) {
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

	// -- Request File Create --------------------------- //

	async requestFileCreate(path:string, contents:string=""):Promise<IFileMeta|null> {
		/** @todo (6/26/20) check if path in workspace? */
		return this._app._fsal.createFile(path, contents)
			.then(
				() => { return this._app.workspace?.updatePath(path)||null; },
				(reason) => { console.error("error creating file", reason); return null; }
			)
	}

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
		if (hash === undefined || !(fileMeta = this._app.getFileByHash(hash))) {
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

	//// TAGS //////////////////////////////////////////////

	// -- Request External Link Open -------------------- //

	async requestExternalLinkOpen(url: string) {
		shell.openExternal(url, { activate: true });
	}

	// -- Request Tag Open ------------------------------ //

	async requestTagOpen(data:{tag: string, create:boolean}):Promise<void> {
		if (!this._app.window) { return; }

		// get files which define this tag
		let defs: string[]|null = this._app.getDefsForTag(data.tag);
		let fileHash:string;

		if (defs == null){
			// expect NULL when no crossref plugin active
			return;
		} else if (defs.length == 0) {
			// create a file for this tag when none exists?
			if(!data.create){ return; }
			console.log(`MainIPC :: creating file for tag '${data.tag}'`);

			/** @todo (6/27/20)
			 * what if data.tag is not a valid file name?
			 * what if it contains slashes?  what if it uses \ instead of /?
			 */

			// create file for this tag when none exists
			let fileName:string = data.tag + ".md";
			let filePath:string|null = this._app.resolveWorkspaceRelativePath(fileName);
			if(!filePath){
				console.error("MainIPC :: could not create file for tag, no active workspace");
				return;
			}

			// create file
			let fileContents:string = this._app.getDefaultFileContents(".md", fileName)
			let file:IFileMeta|null = await this.requestFileCreate(filePath, fileContents);
			if(!file){
				console.error("MainIPC :: unknown error creating file for tag");
				return;
			}

			// set hah
			fileHash = file.hash;
		} else if(defs.length == 1){
			fileHash = defs[0];
		} else {
			/** @todo (6/20/20) handle more than one defining file for tag */
			return;
		}

		// load file from hash
		this.requestFileOpen({ hash: fileHash });
	}
}

export type MainIpcEvents = keyof MainIpcHandlers;