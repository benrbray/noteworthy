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
import { ipynbSchema, ipynbParser, ipynbSerializer } from "@common/ipynb";
import { buildInputRules_markdown, buildKeymap_markdown } from "@common/pm-schema";

// views
import { InlineMathView } from "./inlinemath";

////////////////////////////////////////////////////////////

// editor class
export class IpynbEditor extends Editor<ProseEditorState> {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_keymap: ProsePlugin;
	_initialized: boolean;

	// == Constructor =================================== //
	
	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, ipc: RendererIPC) {
		super(file, editorElt, ipc);

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._proseSchema = ipynbSchema;

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
		// initialize only once
		if(this._initialized){ return; }
		// create prosemirror instance
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: ProseEditorState.create({
				doc: ProseDOMParser.fromSchema(this._proseSchema).parse(
					document.getElementById("pm-ipynb-content") as HTMLElement
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
		throw new Error("Method not implemented.");
	}

	parseContents(contents: string): ProseEditorState {
		let config = {
			schema: this._proseSchema,
			plugins: [
				keymap(baseKeymap),
				keymap(buildKeymap_markdown(this._proseSchema)),
				buildInputRules_markdown(this._proseSchema)
			]
		}

		// parse
		let parsed = ipynbParser.parse(contents);
		console.log(parsed);
		return ProseEditorState.fromJSON(config, parsed);
	}

	setContents(contents: ProseEditorState): void {
		this._proseEditorView?.updateState(contents);
	}

	// == File Management =============================== //

	saveCurrentFile(saveas: boolean = true) {
		console.warn("editor-ipynb :: saving not implemented");
	}
}