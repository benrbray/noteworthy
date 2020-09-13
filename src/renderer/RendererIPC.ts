import Renderer from "./render";
import { IPossiblyUntitledFile, IDirEntryMeta } from "@common/fileio";
import { getStatic } from "@common/static";

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

	/**
	 * @todo (9/12/20) Where should static path vs absolute path be resolved?  This is hacky.
	 * @param data.themeCssPath Path to a theme.css file.
	 * @param data.isStaticPath When FALSE, expect an absolute path.
	 *    When TRUE, will resolve the relative path with `getStatic()`
	 */
	async applyThemeCss(cssString:string){
		this._renderer.applyThemeCss(cssString);
	}
}

export type RendererIpcEvents = keyof RendererIpcHandlers;