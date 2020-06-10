import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
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

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, ipc: RendererIPC) {
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
			this._currentFile = new IUntitledFile();
		}

		this._currentFile.name = fileName;
	}

	setCurrentFile(file: IPossiblyUntitledFile | null) {
		// destroy current editor
		if (this._proseEditorView) {
			this._proseEditorView.destroy();
			delete this._proseEditorView;
		}

		// if fileInfo not present, create new untitled file
		if (!file) {
			file = new IUntitledFile();
		}

		// set current file
		this._currentFile = file;

		// [ProseMirror] config
		let state: EditorState;
		let config = {
			schema: FancySchema,
			plugins: [this._keymap, keymap(baseKeymap)]
		}

		// [ProseMirror] read state from file, if possible
		if (file == null) {
			state = EditorState.create(config);
		} else {
			state = EditorState.fromJSON(
				config,
				JSON.parse(file.contents)
			)
		}

		// [ProseMirror] create new editor
		this._proseEditorView = new ProseEditorView(this._editorElt, { state });
	}

	saveCurrentFile(saveas: boolean = true) {
		if (!this._currentFile) {
			console.log("renderer :: saveCurrentFile() :: no open file, cannot save");
			return;
		}

		if (!this._proseEditorView) {
			console.log("renderer :: saveCurrentFile() :: no editor!");
			return;
		}

		// update file contents based on editor state
		this._currentFile.contents = JSON.stringify(
			this._proseEditorView.state.toJSON(), undefined, "\t"
		);

		// TODO: keep track of whether _currentFile.contents are stale?

		// if file is untitled, ask the user for a save location
		if (saveas || this._currentFile.name == null) {
			this._ipc.openSaveAsDialog(this._currentFile);
		} else {
			this._ipc.requestFileSave(this._currentFile);
		}
		// TODO: watch for success/failure?
	}
}