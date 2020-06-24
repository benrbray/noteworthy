import { shell, ipcRenderer } from "electron";
import Renderer from "./render";
import { IFileWithContents, IPossiblyUntitledFile, IDirEntry, IDirEntryMeta } from "@common/fileio";
import { FileEvents, FsalEvents, UserEvents, MenuEvents, EditorEvents } from "@common/events";

export default class RendererIPC {
	_app:Renderer;

	constructor(appRenderer:Renderer){
		this._app = appRenderer;
	}

	init(){
		console.log("RendererIPC :: init()");

		ipcRenderer.on(FileEvents.FILE_DID_OPEN, (event:Event, file:IFileWithContents)=> {
			console.log("RendererIPC :: FILE_OPENED");
			this._app.setCurrentFile(file);
		});

		ipcRenderer.on(FileEvents.FILE_DID_SAVE, (event: Event, arg: Object) => {
			console.log("RendererIPC :: FILE_SAVED", event, arg);
			this._app._editor?.handleFileDidSave()
		});

		ipcRenderer.on(FileEvents.FILE_DID_SAVEAS, (event: Event, filePath: string) => {
			console.log("RendererIPC :: FILE_SAVED_AS", event, filePath);
			this._app.setCurrentFilePath(filePath);
			this._app._editor?.handleFileDidSave()
		});

		ipcRenderer.on(FsalEvents.FILETREE_CHANGED, (event: Event, fileTree: IDirEntryMeta[]) => {
			console.log("RendererIPC :: filetree-changed", event, fileTree);
			if(!this._app._explorer){ return; }
			this._app._explorer.setFileTree(fileTree);
		});

		ipcRenderer.on(MenuEvents.MENU_FILE_SAVE, (event: Event) => {
			console.log("RendererIPC :: MENU_FILE_SAVE", event);
			this._app._editor?.saveCurrentFile(false);
		});

		ipcRenderer.on(MenuEvents.MENU_FILE_SAVEAS, (event: Event) => {
			console.log("RendererIPC :: MENU_FILE_SAVEAS", event);
			this._app._editor?.saveCurrentFile(true);
		});
	}

	////////////////////////////////////////////////////////

	openFileDialog(){
		console.log("RendererIPC :: openFileDialog()");
		ipcRenderer.send(UserEvents.DIALOG_FILE_OPEN);
	}

	/**
	 * @returns file path selected by the user
	 */
	openSaveAsDialog(fileInfo:IPossiblyUntitledFile):Promise<string> {
		console.log("RendererIPC :: openSaveAsDialog()");
		return ipcRenderer.invoke(UserEvents.DIALOG_FILE_SAVEAS, fileInfo);
	}

	/**
	 * @returns TRUE if save successful, FALSE otherwise
	 */
	requestFileSave(fileInfo:IFileWithContents):Promise<boolean> {
		console.log("RendererIPC :: requestFileSave()");
		return ipcRenderer.invoke(UserEvents.REQUEST_FILE_SAVE, fileInfo);
	}

	requestFilePathOpen(filePath: string) {
		console.log("RendererIPC :: requestFilePathOpen()");
		ipcRenderer.send(UserEvents.REQUEST_FILE_OPEN_PATH, filePath);
	}

	requestFileHashOpen(fileHash: string) {
		console.log("RendererIPC :: requestFileHashOpen()");
		ipcRenderer.send(UserEvents.REQUEST_FILE_OPEN_HASH, fileHash);
	}

	requestTagOpen(tag: string) {
		console.log("RendererIPC :: requestTagOpen()");
		ipcRenderer.send(UserEvents.REQUEST_TAG_OPEN, tag);
	}

	requestExternalLinkOpen(url: string){
		console.log("RendererIPC :: requestExternalLinkOpen");
		shell.openExternal(url, { activate: true });
	}

	/**
	 * @returns TRUE if changes should be saved, FALSE otherwise.
	 */
	askSaveDiscardChanges(filePath:string):Promise<boolean> {
		console.log("RendererIPC :: askSaveDiscardChanges");
		return ipcRenderer.invoke(EditorEvents.ASK_SAVE_DISCARD_CHANGES, filePath);
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
		console.log("RendererIPC :: handleEvent", cmd);
		switch (cmd) {
			// FILE_OPEN
			case FileEvents.FILE_DID_OPEN:
				break;
			// FILE_SAVE
			case FileEvents.FILE_DID_SAVE:
				break;
			// UNKNOWN
			default:
				console.log("RendererIPC :: unknown command");
				break;
		}
	}
}