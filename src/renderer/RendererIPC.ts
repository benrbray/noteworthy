import { shell, ipcRenderer, IpcRenderer } from "electron";
import Renderer from "./render";
import { IFileWithContents, IPossiblyUntitledFile, IDirEntry, IDirEntryMeta } from "@common/fileio";
import { FileEvents, FsalEvents, UserEvents, MenuEvents, EditorEvents } from "@common/events";
import MainIPC, { MainIpcEventHandlers } from "@main/MainIPC";
import { invokerFor, senderFor } from "@common/ipc";

////////////////////////////////////////////////////////////

const ipcProxy = invokerFor<MainIpcEventHandlers>(ipcRenderer, "command");

////////////////////////////////////////////////////////////

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
		return ipcProxy.dialogFileOpen();
	}

	/**
	 * @returns file path selected by the user
	 */
	openSaveAsDialog(fileInfo:IPossiblyUntitledFile):Promise<string|null> {
		return ipcProxy.dialogFileSaveAs(fileInfo);
	}

	/**
	 * @returns TRUE if save successful, FALSE otherwise
	 */
	requestFileSave(fileInfo:IFileWithContents):Promise<boolean> {
		return ipcProxy.requestFileSave(fileInfo);
	}

	requestFilePathOpen(filePath: string) {
		return ipcProxy.requestFileOpen({ path: filePath });
	}

	requestFileHashOpen(fileHash: string) {
		return ipcProxy.requestFileOpen({hash : fileHash});
	}

	requestTagOpen(tag: string) {
		return ipcProxy.requestTagOpen(tag);
	}

	requestTagOpenOrCreate(tag: string) {
		return ipcProxy.requestTagOpenOrCreate(tag);
	}

	requestExternalLinkOpen(url: string){
		return ipcProxy.requestExternalLinkOpen(url);
	}

	/**
	 * @returns TRUE if changes should be saved, FALSE otherwise.
	 */
	askSaveDiscardChanges(filePath:string):Promise<boolean> {
		return ipcProxy.askSaveDiscardChanges(filePath);
	}
}