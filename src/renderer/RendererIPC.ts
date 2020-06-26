import { shell, ipcRenderer, IpcRenderer, IpcRendererEvent } from "electron";
import Renderer from "./render";
import { IFileWithContents, IPossiblyUntitledFile, IDirEntry, IDirEntryMeta } from "@common/fileio";
import { FileEvents, FsalEvents, UserEvents, MenuEvents, EditorEvents } from "@common/events";
import MainIPC, { MainIpcEventHandlers } from "@main/MainIPC";
import { invokerFor, senderFor } from "@common/ipc";

////////////////////////////////////////////////////////////

const ipcProxy = invokerFor<MainIpcEventHandlers>(ipcRenderer, "command");

////////////////////////////////////////////////////////////

export default class RendererIPC {
	_renderer:Renderer;
	_eventHandlers:RendererIpcHandlers;

	constructor(renderer:Renderer){
		this._renderer = renderer;
		this._eventHandlers = new RendererIpcHandlers(this._renderer);
	}

	init(){
		console.log("RendererIPC :: init()");

		ipcRenderer.on("mainCommand", (evt:IpcRendererEvent, key: RendererIpcEvents, data:any)=> {
			this.handle(key, data);
		});
	}

	handle<T extends RendererIpcEvents>(name: T, data: Parameters<RendererIpcHandlers[T]>[0]){
		return this._eventHandlers[name](data as any);
	}
}

export class RendererIpcHandlers {
	private _renderer:Renderer;

	constructor(renderer:Renderer){
		this._renderer = renderer;
	}

	menuFileSave(){
		this._renderer._editor?.saveCurrentFile(false);
	}

	menuFileSaveAs(){
		this._renderer._editor?.saveCurrentFile(true);
	}

	filetreeChanged(fileTree:IDirEntryMeta[]){
		if (!this._renderer._explorer) { return; }
		this._renderer._explorer.setFileTree(fileTree);
	}

	fileDidSave(data:{ saveas:boolean , path:string }){
		this._renderer._editor?.handleFileDidSave()
	}

	fileDidOpen(file:IPossiblyUntitledFile){
		this._renderer.setCurrentFile(file);
	}
}

export type RendererIpcEvents = keyof RendererIpcHandlers;