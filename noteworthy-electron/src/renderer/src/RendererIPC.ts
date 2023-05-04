import Renderer, { IRendererState } from "./render";
import { IPossiblyUntitledFile, IDirEntryMeta } from "@common/files";

////////////////////////////////////////////////////////////

export class RendererIpcHandlers {
	private _renderer:Renderer;

	constructor(renderer:Renderer){
		this._renderer = renderer;
	}

	async menuFileSave():Promise<void> {
		return this._renderer._editor?.saveCurrentFile(false);
	}

	async menuFileSaveAs():Promise<void> {
		return this._renderer._editor?.saveCurrentFile(true);
	}

	async fileTreeChanged(fileTree:IDirEntryMeta[]):Promise<void>{
		console.log("RenderIPC :: fileTreeChanged", fileTree.map(val=>val.name));
		this._renderer.setFileTree(fileTree);
	}

	async fileDidSave(data:{ saveas:boolean , path:string }):Promise<void> {
		return this._renderer._editor?.handleFileDidSave()
	}

	async fileDidOpen(file:IPossiblyUntitledFile):Promise<void> {
		return this._renderer.setCurrentFile(file);
	}

	async navHistoryChanged(history: IRendererState["navigationHistory"]){
		// TODO (2021/03/12) navigation should probably be handled entirely in the render process
		this._renderer.setNavHistory(history);
	}

	/**
	 * @returns FALSE if file failed to close due to unsaved changes,
	 *      TRUE otherwise.  Useful for deciding whether app can quit.
	 */
	async requestFileClose():Promise<void> {
		if(!this._renderer._editor){ console.error("no editor to close!"); return; }
		let result = await this._renderer._editor.closeAndDestroy();
		return;
	}

	/**
	 * @rejects when user cancels the close operation due to unsaved changes
	 */
	async requestClose(): Promise<void> {
		/** @todo (7/12/20) close multiple open files? */
		return this.requestFileClose();
	}

	async applyThemeCss(cssString:string){
		this._renderer.applyThemeCss(cssString);
	}
}

export type RendererIpcEvents = keyof RendererIpcHandlers;