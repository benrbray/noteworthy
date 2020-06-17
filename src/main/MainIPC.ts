import { ipcMain, dialog } from "electron";
import { readFile, saveFile, IUntitledFile, IFileWithContents, IPossiblyUntitledFile, IDirEntry } from "@common/fileio";
import App from "./app"
import { UserEvents, FsalEvents, FileEvents } from "@common/events";

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
		ipcMain.on(UserEvents.DIALOG_FILE_SAVEAS, (evt: Event, file: IPossiblyUntitledFile) => {
			this.handle_dialogFileSaveAs(file);
		});
		
		// REQUEST_FILE_SAVE
		ipcMain.on(UserEvents.REQUEST_FILE_SAVE, (evt:Event, file: IFileWithContents) => {
			this.handle_requestFileSave(file);
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
				this.handle_fileTreeChanged(arg as IDirEntry[]);
				break;
			default:
				break;
		}
	}

	// == Event Handlers ================================ //

	handle(cmd:string, arg: any){

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

		const fileText:string = readFile(filePaths[0]);

		console.log(filePaths[0]);
		this._app.window.window.webContents.send(FileEvents.FILE_DID_OPEN, {
			path: filePaths[0],
			contents: fileText
		});
	}

	private handle_dialogFileSaveAs(file: IPossiblyUntitledFile) {
		if (!this._app.window) { return; }
		console.log("MainIPC :: DIALOG_SAVE_AS");

		const newFilePath: string | undefined = dialog.showSaveDialogSync(
			//TODO: better default "save as" path?
			this._app.window.window,
			{
				defaultPath: file.path || "",
				//filters: FILE_FILTERS
			}
		);
		if (!newFilePath) return;
		saveFile(newFilePath, file.contents);

		// send new file path to renderer
		// TODO: handle this event in renderer!!
		this._app.window.window.webContents.send(FileEvents.FILE_DID_SAVEAS, newFilePath);
	}

	private handle_requestFileSave(file: IFileWithContents) {
		if (!this._app.window) { return; }

		console.log("MainIPC :: FILE_SAVE");
		saveFile(file.path, file.contents);
			// TODO: send success/fail back to renderer?
	}

	private handle_fileTreeChanged(fileTree: IDirEntry[]) {
		if (!this._app.window) { return; }

		console.log("MainIPC :: filetree-changed");

		this._app.window.window.webContents.send(FsalEvents.FILETREE_CHANGED, fileTree);
	}
}