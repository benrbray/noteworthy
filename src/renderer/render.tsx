// node imports
import { clipboard, ipcRenderer } from "electron";
import * as fs from "fs";

// prosemirror imports
import { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { findWrapping, StepMap } from "prosemirror-transform"
import { keymap } from "prosemirror-keymap"
import { baseKeymap, toggleMark } from "prosemirror-commands"
import { undo, redo } from "prosemirror-history"

// project imports
import RendererIPC from "./RendererIPC";
import { IPossiblyUntitledFile } from "@common/fileio";
import { FancySchema, PlainSchema } from "@common/pm-schema";
import { Plugin as ProsePlugin } from "prosemirror-state";
import { ProseMirrorEditor } from "./editors/editor-prosemirror";
import { MarkdownEditor } from "./editors/editor-markdown";
import { IpynbEditor } from "./editors/editor-ipynb";

class Renderer {

	// renderer objects
	_ipc:RendererIPC;

	// ui elements
	buttonNew: HTMLButtonElement;
	buttonOpen: HTMLButtonElement;
	buttonSave: HTMLButtonElement;
	buttonSaveAs: HTMLButtonElement;
	titleElt: HTMLDivElement;
	_editorElt: HTMLDivElement;

	// prosemirror
	_editor:ProseMirrorEditor|null;
	_currentFile:IPossiblyUntitledFile;

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
		this.buttonNew = document.getElementById("buttonNew") as HTMLButtonElement;
		this.buttonOpen = document.getElementById("buttonOpen") as HTMLButtonElement;
		this.buttonSave = document.getElementById("buttonSave") as HTMLButtonElement;
		this.buttonSaveAs = document.getElementById("buttonSaveAs") as HTMLButtonElement;
		this.titleElt = document.getElementById("title") as HTMLDivElement;
		this._editorElt = document.getElementById("editor") as HTMLDivElement;
	}

	init(){
		console.log("render :: init()");
		this._ipc.init();
		this.initButtons();

		if(this._currentFile){
			this.setCurrentFile(this._currentFile);
		}
	}

	initButtons(){
		this.buttonOpen.addEventListener("click", () => {
			if(!this._editor){ return; }
			this._ipc.openFileDialog();
		});
		this.buttonSave.addEventListener("click", () => {
			if (!this._editor) { return; }
			this._editor.saveCurrentFile(false);
		});
		this.buttonSaveAs.addEventListener("click", () => {
			if (!this._editor) { return; }
			this._editor.saveCurrentFile(true);
		});
	}

	setCurrentFile(file:IPossiblyUntitledFile):void {
		// clean up current editor
		/** @todo (6/9/20) improve performance by not completely
		 * deleting old editor when new file has same type as old one */
		if(this._editor){ this._editor.destroy(); }

		console.log("render :: setCurrentFile", file);
		this._currentFile = file;

		// create new editor
		this._editor = new ProseMirrorEditor(
			this._currentFile,
			this._editorElt,
			this._ipc
		)
		this._editor.init();
	}

	setCurrentFilePath(filePath:string):void {
		if(this._editor){
			this._editor.setCurrentFilePath(filePath);
		}
	}
}

export default Renderer;