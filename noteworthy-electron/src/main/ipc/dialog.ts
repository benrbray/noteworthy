import { DialogSaveDiscardOptions } from "@common/dialog";
import { IPossiblyUntitledFile } from "@common/files";
import { MainIpcChannel } from "@main/MainIPC";
import NoteworthyApp from "@main/app";
import { FSAL } from "@main/fsal/fsal";
import { WorkspaceService } from "@main/workspace/workspace-service";
import { dialog } from "electron";

export class MainIpc_DialogHandlers implements MainIpcChannel {

	get name() { return "dialog" as const; }

	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(
		private _app: NoteworthyApp,
		private _fsal: FSAL,
		private _workspaceService: WorkspaceService
	){ }

	// -- Show Notification ----------------------------- //

	showNotification(msg: string) {
		/** @todo (6/26/20) implement notifications */
	}

	showError(msg: string) {
		/** @todo (6/26/20) implement error notifications */
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

		throw new Error("MainIpc_DialogHandlers :: opening individual file from path is not implemented");

		// load file from path
		//this._navigationHandlers.requestFileOpen({ path: filePaths[0] })
	}

	// -- Dialog File Create ---------------------------- //

	async dialogFileNewPath(): Promise<string> {
		if (!this._app.window) { return Promise.reject("no active window"); }

		// default "new file" path
		const workspaceDir = this._workspaceService.getWorkspaceDir();

		const newFilePath: string | undefined = dialog.showSaveDialogSync(
			this._app.window.window,
			{
				title: "New Document",
				buttonLabel: "New Document",
				properties: ["showOverwriteConfirmation"],
				...(workspaceDir && { defaultPath: workspaceDir.path })
			}
		);
		if (!newFilePath) { return Promise.reject("no file path specified"); }
		else              { return newFilePath;                              }
	}

	async dialogFileNew(): Promise<void> {
		const newFilePath = await this.dialogFileNewPath();

		// create and open new file
		let newFile = await this._workspaceService.createFile(newFilePath, "");
		if(!newFile) { return Promise.reject("failed to create new file"); }

		return this._app._eventHandlers.navigation.navigateToHash({ hash: newFile.hash });
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
		this._fsal.saveFile(newFilePath, file.contents, false);

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
