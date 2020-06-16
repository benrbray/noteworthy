// node imports
import * as pathlib from "path";

// project imports
import RendererIPC from "./RendererIPC";
import { IPossiblyUntitledFile } from "@common/fileio";
import { ProseMirrorEditor } from "./editors/editor-prosemirror";
import { MarkdownEditor } from "./editors/editor-markdown";
import { IpynbEditor } from "./editors/editor-ipynb";
import { Explorer } from "./explorer/explorer";
import { JournalEditor } from "./editors/editor-journal";

class Renderer {

	// renderer objects
	_ipc:RendererIPC;

	// ui elements
	_buttonNew: HTMLButtonElement;
	_buttonOpen: HTMLButtonElement;
	_buttonSave: HTMLButtonElement;
	_buttonSaveAs: HTMLButtonElement;
	_titleElt: HTMLDivElement;
	_editorElt: HTMLDivElement;
	_sidebarElt: HTMLDivElement;

	// prosemirror
	_editor:ProseMirrorEditor|null;
	_currentFile:IPossiblyUntitledFile;

	// sidebar
	_explorer:Explorer|undefined;

	constructor(){
		// initialize objects
		this._ipc = new RendererIPC(this);
		/** @todo (6/9/20) propery set modTime/creationTime */
		this._currentFile = {
			contents: "",
			modTime: -1,
			creationTime: -1
		};
		
		this._editor = null;

		// dom elements
		this._buttonNew = document.getElementById("buttonNew") as HTMLButtonElement;
		this._buttonOpen = document.getElementById("buttonOpen") as HTMLButtonElement;
		this._buttonSave = document.getElementById("buttonSave") as HTMLButtonElement;
		this._buttonSaveAs = document.getElementById("buttonSaveAs") as HTMLButtonElement;
		this._titleElt = document.getElementById("title") as HTMLDivElement;
		this._editorElt = document.getElementById("editor") as HTMLDivElement;
		this._sidebarElt = document.getElementById("sidebar") as HTMLDivElement;
	}

	init(){
		console.log("render :: init()");
		this._ipc.init();
		this.initButtons();
		this.initExplorer();

		if(this._currentFile){
			this.setCurrentFile(this._currentFile);
		}
	}

	initButtons(){
		this._buttonOpen.addEventListener("click", () => {
			if(!this._editor){ return; }
			this._ipc.openFileDialog();
		});
		this._buttonSave.addEventListener("click", () => {
			if (!this._editor) { return; }
			this._editor.saveCurrentFile(false);
		});
		this._buttonSaveAs.addEventListener("click", () => {
			if (!this._editor) { return; }
			this._editor.saveCurrentFile(true);
		});
	}

	initExplorer(){
		this._explorer = new Explorer(this._sidebarElt);
	}

	setCurrentFile(file:IPossiblyUntitledFile):void {
		// clean up current editor
		/** @todo (6/9/20) improve performance by not completely
		 * deleting old editor when new file has same type as old one */
		if(this._editor){ this._editor.destroy(); }

		console.log("render :: setCurrentFile", file);
		this._currentFile = file;

		// get extension type
		let ext:string = pathlib.extname(this._currentFile.path || "");
		console.log("setCurrentFile :: extension ", ext);

		switch (ext) {
			case ".ipynb":
				this._editor = new IpynbEditor(
					this._currentFile, this._editorElt, this._ipc
				);
				break;
			case ".json":
				this._editor = new ProseMirrorEditor(
					this._currentFile, this._editorElt, this._ipc
				);
				break;
			case ".journal":
				this._editor = new JournalEditor(
					this._currentFile, this._editorElt, this._ipc
				);
				break;
			case ".md":
			case ".txt":
			default:
				this._editor = new MarkdownEditor(
					this._currentFile, this._editorElt, this._ipc
				);
				break;
		}

		this._editor.init();
	}

	setCurrentFilePath(filePath:string):void {
		if(this._editor){
			this._editor.setCurrentFilePath(filePath);
		}
	}
}

export default Renderer;