import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
import { EditorView as ProseEditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser } from "prosemirror-model";
import RendererIPC from "@renderer/RendererIPC";
import { FancySchema } from "@common/pm-schema";
import { EditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { Editor } from "./editor";

export class ProseMirrorEditor extends Editor<EditorState> {

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

	// == Lifecycle ===================================== //

	init() {
		if(this._initialized) { return; }
		// create prosemirror instance
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: EditorState.create({
				doc: ProseDOMParser.fromSchema(FancySchema).parse(
					document.getElementById("pm-content") as HTMLElement
				),
				plugins: [this._keymap, keymap(baseKeymap)]
			})
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

	parseContents(contents: string):EditorState {
		let config = {
			schema: FancySchema,
			plugins: [this._keymap, keymap(baseKeymap)]
		}
		return EditorState.fromJSON( config, JSON.parse(contents) )
	}
	setContents(content: EditorState): void {
		this._proseEditorView?.updateState(content);
	}
}