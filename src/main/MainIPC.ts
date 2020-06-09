import { ipcMain, dialog } from "electron";
import { FILE_IO, readFile, saveFile, IFileInfo, INamedFile } from "@common/fileio";
import App from "./app"

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
		
		// DIALOG_OPEN
		ipcMain.on(FILE_IO.DIALOG_OPEN, (evt:Event) => { 
			this.handle_dialogFileOpen();
		});
			
		// DIALOG_SAVE_AS
		ipcMain.on(FILE_IO.DIALOG_SAVE_AS, (evt: Event, fileInfo: IFileInfo) => {
			this.handle_dialogFileSaveAs(fileInfo);
		});
		
		// DIALOG_SAVE_AS
		ipcMain.on(FILE_IO.FILE_SAVE, (evt:Event, fileInfo: INamedFile) => {
			this.handle_requestFileSave(fileInfo);
		});
		
		this._initialized = true;
	}

	send(cmd: string, arg: any): void {
		console.log("MainIPC :: send ::", cmd, arg);

		switch (cmd) {
			case FILE_IO.FILE_OPEN:
				this.handle_dialogFileOpen();
				break;
			case FILE_IO.FOLDER_OPEN:
				this.handle_dialogFolderOpen();
				break;
			case FILE_IO.DIALOG_SAVE_AS:
				this.handle_dialogFileSaveAs(arg as IFileInfo);
				break;
			case FILE_IO.FILE_SAVE:
				this.handle_requestFileSave(arg as INamedFile);
				break;
			default:
				break;
		}
	}

	// == Event Handlers ================================ //

	handle(cmd:string, arg: any){

	}

	handle_dialogFolderOpen(){
		if (!this._app.window) { return; }
		console.log("MainIPC :: DIALOG_FOLDER_OPEN");

		// open file dialog
		const dirNames: string[] | undefined = dialog.showOpenDialogSync(
			this._app.window.window,
			{
				properties: ['openDirectory', 'createDirectory'],
				//filters: FILE_FILTERS
			}
		);
		if (!dirNames || !dirNames.length) return;

		this._app.setActiveDir(dirNames[0]);
	}

	handle_dialogFileOpen(){
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
		console.log(fileNames[0]);
		this._app.window.window.webContents.send(FILE_IO.FILE_OPENED, {
			fileName: fileNames[0],
			fileText
		});
	}

	handle_dialogFileSaveAs(fileInfo: IFileInfo) {
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
	}



	handle_requestFileSave(fileInfo: INamedFile) {
		if (!this._app.window) { return; }

		console.log("MainIPC :: FILE_SAVE");
		saveFile(fileInfo.fileName, fileInfo.fileText);
			// TODO: send success/fail back to renderer?
	}
}