import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
import { EditorView as ProseEditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser } from "prosemirror-model";
import RendererIPC from "@renderer/RendererIPC";
import { FancySchema } from "@common/pm-schema";
import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { Editor } from "./editor";

export class ProseMirrorEditor extends Editor<ProseEditorState> {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_keymap: ProsePlugin;
	_initialized:boolean;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, ipc: RendererIPC) {
		super(file, editorElt, ipc);

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._proseSchema = FancySchema;

		const insertStar = (state: ProseEditorState, dispatch: ((tr: Transaction) => void)) => {
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

	// == Lifecycle ===================================== //

	init() {
		// initialize only once
		if(this._initialized){ return; }
		// create prosemirror config
		let config = {
			schema: this._proseSchema,
			plugins: [ this._keymap, keymap(baseKeymap) ]
		};
		// create prosemirror state (from file)
		let state:ProseEditorState;
		if (this._currentFile && this._currentFile.contents) {
			state = this.parseContents(this._currentFile.contents);
		} else {
			state = ProseEditorState.create(config);
		}
		// create prosemirror instance
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: state,
		});
		// initialized
		this._initialized = true;
	}

	destroy(){
		// destroy prosemirror instance
		this._proseEditorView?.destroy();
		this._proseEditorView = null;

		// de-initialize
		this._initialized = false;
	}

	// == Document Model ================================ //

	serializeContents():string {
		if(!this._proseEditorView){ return ""; }
		return JSON.stringify(
			this._proseEditorView.state.toJSON(), undefined, "\t"
		);
	}

	parseContents(contents: string): ProseEditorState {
		let config = {
			schema: FancySchema,
			plugins: [this._keymap, keymap(baseKeymap)]
		}
		return ProseEditorState.fromJSON( config, JSON.parse(contents) )
	}
	setContents(content: ProseEditorState): void {
		this._proseEditorView?.updateState(content);
	}
}