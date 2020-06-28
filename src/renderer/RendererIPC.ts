import Renderer from "./render";
import { IPossiblyUntitledFile, IDirEntryMeta } from "@common/fileio";

////////////////////////////////////////////////////////////

export class RendererIpcHandlers {
	private _renderer:Renderer;

	constructor(renderer:Renderer){
		this._renderer = renderer;
	}

	async menuFileSave(){
		this._renderer._editor?.saveCurrentFile(false);
	}

	async menuFileSaveAs(){
		this._renderer._editor?.saveCurrentFile(true);
	}

	async fileTreeChanged(fileTree:IDirEntryMeta[]){
		console.log("RenderIPC :: fileTreeChanged", fileTree.map(val=>val.name));
		if (!this._renderer._explorer) { return; }
		this._renderer._explorer.setFileTree(fileTree);
	}

	async fileDidSave(data:{ saveas:boolean , path:string }){
		this._renderer._editor?.handleFileDidSave()
	}

	async fileDidOpen(file:IPossiblyUntitledFile){
		this._renderer.setCurrentFile(file);
	}
}

export type RendererIpcEvents = keyof RendererIpcHandlers;