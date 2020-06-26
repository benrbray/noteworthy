import { shell, ipcRenderer, IpcRenderer } from "electron";
import Renderer from "./render";
import { IFileWithContents, IPossiblyUntitledFile, IDirEntry, IDirEntryMeta } from "@common/fileio";
import { FileEvents, FsalEvents, UserEvents, MenuEvents, EditorEvents } from "@common/events";
import MainIPC, { MainIpcEventHandlers, MainIpcInvokeHandlers } from "@main/MainIPC";

////////////////////////////////////////////////////////////

type FunctionPropertyNames<T> = { [K in keyof T]: K extends string ? (T[K] extends Function ? K : never) : never }[keyof T];

// here is an attempt at type-safe ipc with the main process
// it's not bullet-proof, but it's better than shuffling strings
function senderFor<T extends object>(ipc: IpcRenderer): T {
	let result = { ipc };
	return new Proxy(result, {
		get(target, prop: FunctionPropertyNames<T>, receiver: any) {
			return (data: any) => target.ipc.send("command", prop, data);
		}
	});
}

function invokerFor<T extends object>(ipc: IpcRenderer): T {
	let result = { ipc };
	return new Proxy(result, {
		get(target, prop: FunctionPropertyNames<T>, receiver: any) {
			return (data: any) => target.ipc.invoke("invokeCommand", prop, data);
		}
	});
}

const ipcProxy = senderFor<MainIpcEventHandlers>(ipcRenderer);
const ipcInvokeProxy = invokerFor<MainIpcInvokeHandlers>(ipcRenderer);

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
		console.log("RendererIPC :: openFileDialog()");
		ipcProxy.dialogFileOpen();
	}

	/**
	 * @returns file path selected by the user
	 */
	openSaveAsDialog(fileInfo:IPossiblyUntitledFile):Promise<string|null> {
		console.log("RendererIPC :: openSaveAsDialog()");
		return ipcInvokeProxy.dialogFileSaveAs(fileInfo);
	}

	/**
	 * @returns TRUE if save successful, FALSE otherwise
	 */
	requestFileSave(fileInfo:IFileWithContents):Promise<boolean> {
		console.log("RendererIPC :: requestFileSave()");
		return ipcInvokeProxy.requestFileSave(fileInfo);
	}

	requestFilePathOpen(filePath: string) {
		console.log("RendererIPC :: requestFilePathOpen()");
		ipcProxy.requestFileOpen({ path: filePath });
	}

	requestFileHashOpen(fileHash: string) {
		console.log("RendererIPC :: requestFileHashOpen()");
		ipcProxy.requestFileOpen({hash : fileHash});
	}

	requestTagOpen(tag: string) {
		console.log("RendererIPC :: requestTagOpen()");
		ipcProxy.requestTagOpen(tag);
	}

	requestTagOpenOrCreate(tag: string) {
		console.log("RendererIPC :: requestTagOpenOrCreate()");
		ipcRenderer.send(UserEvents.REQUEST_TAG_OPEN_OR_CREATE, tag);
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
		return ipcInvokeProxy.askSaveDiscardChanges(filePath);
	}
}