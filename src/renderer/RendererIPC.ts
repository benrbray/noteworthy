import { ipcRenderer } from "electron";
import Renderer from "./render";
import { FILE_IO, IFileWithContents, IPossiblyUntitledFile, IDirEntry } from "@common/fileio";

export default class RendererIPC {
	_app:Renderer;

	constructor(appRenderer:Renderer){
		this._app = appRenderer;
	}

	init(){
		console.log("RendererIPC :: init()");

		ipcRenderer.on(FILE_IO.FILE_OPENED, (event:Event, file:IFileWithContents)=> {
			console.log("RendererIPC :: FILE_OPENED");
			this._app.setCurrentFile(file);
		});

		ipcRenderer.on(FILE_IO.FILE_SAVED, (event: Event, arg: Object) => {
			console.log("RendererIPC :: FILE_SAVED", event, arg);
		});

		ipcRenderer.on(FILE_IO.FILE_SAVED_AS, (event: Event, filePath: string) => {
			console.log("RendererIPC :: FILE_SAVED_AS", event, filePath);
			this._app.setCurrentFilePath(filePath);
		});

		ipcRenderer.on("filetree-changed", (event: Event, fileTree: IDirEntry[]) => {
			console.log("RendererIPC :: filetree-changed", event, fileTree);
			if(!this._app._explorer){ return; }
			this._app._explorer.setFileTree(fileTree);
		});
	}

	////////////////////////////////////////////////////////

	openFileDialog(){
		console.log("RendererIPC :: openFileDialog()");
		ipcRenderer.send(FILE_IO.DIALOG_OPEN);
	}

	openSaveAsDialog(fileInfo:IPossiblyUntitledFile) {
		console.log("RendererIPC :: openSaveAsDialog()");
		ipcRenderer.send(FILE_IO.DIALOG_SAVE_AS, fileInfo);
	}

	requestFileSave(fileInfo:IFileWithContents){
		console.log("RendererIPC :: requestFileSave()");
		ipcRenderer.send(FILE_IO.FILE_SAVE, fileInfo);
	}

	////////////////////////////////////////////////////////

	/* DISPATCH
	 * Dispatch a command to the parent.
	 * @param (arg) message body
	 */
	dispatch(arg:{command:string, content?:Object }){
		this.handleEvent(arg.command, arg.content);
	}

	send(command:string, arg:{}={}){

	}

	/* HANDLEEVENT
	 * Act on messages received from the main process.
	 * @param (cmd) message sent from main
	 * @param (content) message body
	 */
	handleEvent(cmd:string, content:any) {
		switch (cmd) {
			// FILE_OPEN
			case FILE_IO.FILE_OPEN:
				break;
			// FILE_SAVE
			case FILE_IO.FILE_SAVE:
				break;
			// UNKNOWN
			default:
				console.log("RendererIPC :: unknown command");
				break;
		}
	}
}