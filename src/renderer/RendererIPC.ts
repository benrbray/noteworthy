import Renderer from "./render";
import { IPossiblyUntitledFile, IDirEntryMeta } from "@common/fileio";

////////////////////////////////////////////////////////////

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