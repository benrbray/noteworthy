import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
import { EditorView as ProseEditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser } from "prosemirror-model";
import RendererIPC from "@renderer/RendererIPC";
import { FancySchema } from "@common/pm-schema";
import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
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
export class MarkdownEditor extends Editor<ProseEditorState> {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_ipc: RendererIPC;
	_editorElt: HTMLElement;
	_keymap: ProsePlugin;
	_initialized:boolean;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, ipc: RendererIPC) {
		super(file, editorElt, ipc);

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._proseSchema = markdownSchema;
		this._editorElt = editorElt;
		this._ipc = ipc;

		const insertStar = (state: ProseEditorState, dispatch: ((tr: Transaction) => void)) => {
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

	// == Lifecycle ===================================== //

	init() {
		// only initialize once
		if(this._initialized){ return; }
		// create prosemirror instance
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: ProseEditorState.create({
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
		// initialized
		this._initialized = true;
	}

	destroy(): void {
		// destroy prosemirror instance
		this._proseEditorView?.destroy();
		this._proseEditorView = null;
		// de-initialize
		this._initialized = false;
	}
	// == Document Model ================================ //

	serializeContents(): string {
		if(!this._proseEditorView){ return ""; }
		return markdownSerializer.serialize(this._proseEditorView.state.doc);
	}

	parseContents(contents: string):ProseEditorState {
		console.log("editor-markdown :: parseContents", contents);
		return ProseEditorState.create({
			doc: markdownParser.parse(contents),
			plugins: [
				keymap(baseKeymap),
				keymap(buildKeymap_markdown(this._proseSchema)),
				buildInputRules_markdown(this._proseSchema)
			]
		});
	}

	setContents(contents: ProseEditorState): void {
		console.log("editor-markdown :: setContents", contents);
		if(!this._proseEditorView){
			console.warn("editor-markdown :: setContents :: no editor!");
			return;
		}

		this._proseEditorView.updateState(contents);
	}
}