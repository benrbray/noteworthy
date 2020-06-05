import { ipcMain, dialog } from "electron";
import { FILE_IO, readFile, saveFile, IFileInfo, INamedFile } from "@common/fileio";
import App from "./app"

export default class MainIPC {

	_app:App;

	constructor(app:App){
		this._app = app;
	}

	init(){
		console.log("MainIPC :: init()");
		// DIALOG_OPEN
		ipcMain.on(FILE_IO.DIALOG_OPEN, () => {
			if (!this._app.window) { return; }
			console.log("MainIPC :: DIALOG_OPEN");

			// open file dialog
			const fileNames: string[] | undefined = dialog.showOpenDialogSync(
				this._app.window.window,
				{
					properties: ['openFile'],
					//filters: FILE_FILTERS
				}
			);
			if (!fileNames || !fileNames.length) return;

			const fileText = readFile(fileNames[0]);
			console.log(fileNames[0], fileText);
			this._app.window.window.webContents.send(FILE_IO.FILE_OPENED, {
				fileName: fileNames[0],
				fileText
			});
		});

		// DIALOG_SAVE_AS
		ipcMain.on(FILE_IO.DIALOG_SAVE_AS, (evt:Event, fileInfo: IFileInfo) => {
			if (!this._app.window) { return; }
			console.log("MainIPC :: DIALOG_SAVE_AS");

			const newFileName: string | undefined = dialog.showSaveDialogSync(
				//TODO: better default "save as" path?
				this._app.window.window,
				{
					defaultPath: fileInfo.fileName || "",
					//filters: FILE_FILTERS
				}
			);
			if (!newFileName) return;
			saveFile(newFileName, fileInfo.fileText);

			// send new file name to renderer
			// TODO: handle this event in renderer!!
			this._app.window.window.webContents.send(FILE_IO.FILE_SAVED_AS, newFileName);
		});

		// DIALOG_SAVE_AS
		ipcMain.on(FILE_IO.FILE_SAVE, (evt:Event, fileInfo: INamedFile) => {
			if (!this._app.window) { return; }

			console.log("MainIPC :: FILE_SAVE");
			saveFile(fileInfo.fileName, fileInfo.fileText);
			// TODO: send success/fail back to renderer?
		});
	}
}