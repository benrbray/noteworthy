import { IFileInfo, UntitledFile } from "@common/fileio";
import { EditorView as ProseEditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser, Schema } from "prosemirror-model";
import RendererIPC from "@renderer/RendererIPC";
import { FancySchema } from "@common/pm-schema";
import { EditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { Editor } from "./editor";

// markdown
import { markdownSchema, markdownParser, markdownSerializer } from "@common/markdown";
import { buildInputRules_markdown, buildKeymap_markdown } from "@common/pm-schema";

// views
import { InlineMathView } from "./inlinemath";

////////////////////////////////////////////////////////////

// editor class
export class MarkdownEditor extends Editor {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_ipc: RendererIPC;
	_editorElt: HTMLElement;
	_keymap: ProsePlugin;

	constructor(file: IFileInfo | null, editorElt: HTMLElement, ipc: RendererIPC) {
		super(file);

		// no editor until initialized
		this._proseEditorView = null;
		this._proseSchema = markdownSchema;
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
			"Ctrl-b": toggleMark(this._proseSchema.marks.shouting),
			"Ctrl-Space": insertStar,
		})
	}

	init() {
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: EditorState.create({
				doc: ProseDOMParser.fromSchema(this._proseSchema).parse(
					document.getElementById("pm-content") as HTMLElement
				),
				plugins: [
					keymap(baseKeymap),
					keymap(buildKeymap_markdown(this._proseSchema)),
					buildInputRules_markdown(this._proseSchema)
				]
			}),
			nodeViews: {
				"math_inline": (node, view, getPos) => {
					return new InlineMathView(node, view, getPos as (() => number));
				},
			}
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

		// [ProseMirror] read state from file, if possible
		let state: EditorState;
		if (fileInfo == null) {
			state = EditorState.create({
				schema: this._proseSchema
			});
		} else {
			state = EditorState.create({
				doc: markdownParser.parse(fileInfo.fileText),
				plugins: [
					keymap(baseKeymap),
					keymap(buildKeymap_markdown(this._proseSchema)),
					buildInputRules_markdown(this._proseSchema)
				]
			});
		}

		// [ProseMirror] create new editor
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state,
			nodeViews: {
				"math_inline": (node, view, getPos) => {
					return new InlineMathView(node, view, getPos as (() => number));
				},
			}
		});
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
		this._currentFile.fileText = markdownSerializer.serialize(this._proseEditorView.state.doc);

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