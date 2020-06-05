import { IFileInfo, UntitledFile } from "@common/fileio";
import { EditorView as ProseEditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser } from "prosemirror-model";
import RendererIPC from "@renderer/RendererIPC";
import { FancySchema } from "@common/pm-schema";
import { EditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { Editor } from "./editor";

export class ProseMirrorEditor extends Editor {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_ipc: RendererIPC;
	_editorElt: HTMLElement;
	_keymap: ProsePlugin;

	constructor(file: IFileInfo | null, editorElt: HTMLElement, ipc: RendererIPC) {
		super(file);

		// no editor until initialized
		this._proseEditorView = null;
		this._proseSchema = FancySchema;
		this._editorElt = editorElt;
		this._ipc = ipc;

		const insertStar = (state: EditorState, dispatch: ((tr: Transaction) => void)) => {
			var type = this._proseSchema.nodes.star;
			var ref = state.selection;
			var $from = ref.$from;
			if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) { return false }
			dispatch(state.tr.replaceSelectionWith(type.create()));
			return true
		}

		this._keymap = this._keymap = keymap({
			"Ctrl-b": toggleMark(FancySchema.marks.shouting),
			"Ctrl-Space": insertStar,
		})
	}

	init() {
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: EditorState.create({
				doc: ProseDOMParser.fromSchema(FancySchema).parse(
					document.getElementById("pm-content") as HTMLElement
				),
				plugins: [this._keymap, keymap(baseKeymap)]
			})
		});
	}

	setCurrentFileName(fileName: string) {
		if (!this._currentFile) {
			this._currentFile = {
				fileName: null,
				fileText: "",
			}
		}

		this._currentFile.fileName = fileName;
	}

	setCurrentFile(fileInfo: IFileInfo | null) {
		// destroy current editor
		if (this._proseEditorView) {
			this._proseEditorView.destroy();
			delete this._proseEditorView;
		}

		// if fileInfo not present, create new untitled file
		if (!fileInfo) {
			fileInfo = {
				fileName: null,
				fileText: ""
			}
		}

		// set current file
		this._currentFile = fileInfo;

		// [ProseMirror] config
		let state: EditorState;
		let config = {
			schema: FancySchema,
			plugins: [this._keymap, keymap(baseKeymap)]
		}

		// [ProseMirror] read state from file, if possible
		if (fileInfo == null) {
			state = EditorState.create(config);
		} else {
			state = EditorState.fromJSON(
				config,
				JSON.parse(fileInfo.fileText)
			)
		}

		// [ProseMirror] create new editor
		this._proseEditorView = new ProseEditorView(this._editorElt, { state });
	}

	saveCurrentFile(saveas: boolean = true) {
		if (!this._currentFile) {
			console.log("renderer :: saveCurrentFile() :: no open file, creating untitled");
			this._currentFile = {
				fileName: null,
				fileText: ""
			}
		}

		if (!this._proseEditorView) {
			console.log("renderer :: saveCurrentFile() :: no editor!");
			return;
		}

		// update file contents based on editor state
		this._currentFile.fileText = JSON.stringify(
			this._proseEditorView.state.toJSON(), undefined, "\t"
		);

		// TODO: keep track of whether _currentFile.contents are stale?

		// if file is untitled, ask the user for a save location
		if (saveas || this._currentFile.fileName == null) {
			this._ipc.openSaveAsDialog(this._currentFile);
		} else {
			this._ipc.requestFileSave(this._currentFile);
		}
		// TODO: watch for success/failure?
	}
}