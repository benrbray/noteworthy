// node imports
import * as pathlib from "path";

// project imports
import { RendererIpcEvents, RendererIpcHandlers } from "./RendererIPC";
import { IPossiblyUntitledFile } from "@common/fileio";
import { ProseMirrorEditor } from "./editors/editor-prosemirror";
import { MarkdownEditor } from "./editors/editor-markdown";
import { IpynbEditor } from "./editors/editor-ipynb";
import { Explorer } from "./explorer/explorer";
import { JournalEditor } from "./editors/editor-journal";
import { MainIpcHandlers } from "@main/MainIPC";
import { ipcRenderer, IpcRendererEvent } from "electron";
import { invokerFor } from "@common/ipc";

////////////////////////////////////////////////////////////

class Renderer {

	// renderer objects
	_mainProxy: MainIpcHandlers;
	_eventHandlers: RendererIpcHandlers;

	// ui elements
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
		this._mainProxy = invokerFor<MainIpcHandlers>(ipcRenderer, "command", "render->main");
		this._eventHandlers = new RendererIpcHandlers(this);

		(window as any).renderer = this;

		/** @todo (6/9/20) propery set modTime/creationTime */
		this._currentFile = {
			type: "file",
			contents: "",
			modTime: -1,
			creationTime: -1
		};
		
		this._editor = null;

		// dom elements
		this._titleElt = document.getElementById("title") as HTMLDivElement;
		this._editorElt = document.getElementById("editor") as HTMLDivElement;
		this._sidebarElt = document.getElementById("sidebar") as HTMLDivElement;
	}

	init(){
		console.log("render :: init()");

		// handle events from main
		ipcRenderer.on("mainCommand", (evt: IpcRendererEvent, key: RendererIpcEvents, data: any) => {
			this.handle(key, data);
		});

		// file explorer
		this.initExplorer();

		// set current file
		if(this._currentFile){
			this.setCurrentFile(this._currentFile);
		}

		// ctrl handler
		/** @todo (6/20/20) where should this code go? */
		const shiftHandler = (evt:KeyboardEvent) => {
			if(evt.ctrlKey) { document.body.classList.add("user-ctrl");    }
			else            { document.body.classList.remove("user-ctrl"); }
		}

		document.addEventListener("keydown", shiftHandler);
		document.addEventListener("keyup", shiftHandler);
		document.addEventListener("keypress", shiftHandler);
	}

	initExplorer(){
		let explorerElt = document.createElement("div");
		explorerElt.className = "explorer";
		this._sidebarElt.appendChild(explorerElt);
		this._explorer = new Explorer(this._sidebarElt, this._mainProxy);
	}

	handle<T extends RendererIpcEvents>(name: T, data: Parameters<RendererIpcHandlers[T]>[0]) {
		return this._eventHandlers[name](data as any);
	}

	async setCurrentFile(file:IPossiblyUntitledFile):Promise<void> {
		// clean up current editor
		/** @todo (6/9/20) improve performance by not completely
		 * deleting old editor when new file has same type as old one */
		if(this._editor){ await this._editor.closeAndDestroy(); }

		console.log("render :: setCurrentFile", file);
		this._currentFile = file;

		this._titleElt.textContent = file.path || "<untitled>";

		// get extension type
		let ext:string = pathlib.extname(this._currentFile.path || "");
		console.log("setCurrentFile :: extension ", ext);

		switch (ext) {
			case ".ipynb":
				this._editor = new IpynbEditor(
					this._currentFile, this._editorElt, this._mainProxy
				);
				break;
			case ".json":
				this._editor = new ProseMirrorEditor(
					this._currentFile, this._editorElt, this._mainProxy
				);
				break;
			case ".journal":
				this._editor = new JournalEditor(
					this._currentFile, this._editorElt, this._mainProxy
				);
				break;
			case ".md":
			case ".txt":
			default:
				this._editor = new MarkdownEditor(
					this._currentFile, this._editorElt, this._mainProxy
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