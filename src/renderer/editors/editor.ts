import { IFileInfo, UntitledFile } from "@common/fileio";
import { EditorView as ProseEditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser } from "prosemirror-model";
import RendererIPC from "@renderer/RendererIPC";
import { FancySchema } from "@common/pm-schema";
import { EditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";

export class Editor {
	_currentFile:IFileInfo;
	_changed:boolean;

	constructor(file:IFileInfo|null){
		// create untitled file if needed
		this._currentFile = file || (new UntitledFile());
		this._changed = false;
	}
}