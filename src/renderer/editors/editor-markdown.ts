
// prosemirror imports
import { EditorView as ProseEditorView, EditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser, MarkType, Node as ProseNode } from "prosemirror-model";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin, EditorState } from "prosemirror-state";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";

// project imports
import RendererIPC from "@renderer/RendererIPC";
import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
import { Editor } from "./editor";

// markdown
import { markdownSchema, markdownParser, markdownSerializer } from "@common/markdown";
import { buildInputRules_markdown, buildKeymap_markdown } from "@common/pm-schema";

// views
import { MathView, ICursorPosObserver } from "@lib/prosemirror-math/src/math-nodeview";
import { mathInputRules } from "@common/inputrules";
import { openPrompt, TextField } from "@common/prompt/prompt";
import { gapCursor } from "prosemirror-gapcursor";
import mathSelectPlugin from "@root/lib/prosemirror-math/src/plugins/math-select";

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

		function markActive(state:EditorState, type:MarkType) {
			let { from, $from, to, empty } = state.selection
			if (empty) return type.isInSet(state.storedMarks || $from.marks())
			else return state.doc.rangeHasMark(from, to, type)
		}

		this._keymap = keymap({
			"Tab": (state, dispatch, view) => {
				dispatch(state.tr.deleteSelection().insertText("\t"));
				return true;
			},
			"Ctrl-s": (state, dispatch, view) => {
				this.saveCurrentFile(false);
				return true;
			},
			"Ctrl-k": (state, dispatch, view) => {
				// only insert link when highlighting text
				if(state.selection.empty){ return false; }

				console.log("link toggle");
				let markType = this._proseSchema.marks.link;
				if(markActive(state, markType)) {
					console.log("link active");
					toggleMark(markType)(state, dispatch)
					return true
				}
				console.log("opening prompt");
				openPrompt({
					title: "Create a link",
					fields: {
						href: new TextField({
							label: "Link target",
							required: true
						}),
						title: new TextField({ label: "Title" })
					},
					callback(attrs: { [key: string]: any; } | undefined) {
						toggleMark(markType, attrs)(view.state, view.dispatch)
						view.focus()
					}
				})
				return true;
			},
			"Ctrl-e": (state, dispatch, view) => {
				let { $from, $to } = state.selection;
				// selection must be entirely within a single node
				if(!$from.sameParent($to)){ return false; }
				
				console.log($from);
				console.log($from.node(), $from.parent)
				console.log("isText?", $from.node().isText, $from.node().isTextblock);
				// get selected node

				// marks
				console.log($from.marks());
				for(let mark of $from.marks()){
					if(mark.type.name == "link"){
						let new_href = prompt("change link:", mark.attrs.href);
						dispatch(state.tr.setNodeMarkup($from.pos, undefined, {
							href: new_href,
							title: mark.attrs.title
						}));
					}
				}

				return true;
			}
		})
	}

	// == Lifecycle ===================================== //

	init() {
		// only initialize once
		if(this._initialized){ return; }
		// create prosemirror config
		let config = {
			schema: this._proseSchema,
			plugins: [
				keymap(buildKeymap_markdown(this._proseSchema)),
				keymap(baseKeymap),
				this._keymap,
				buildInputRules_markdown(this._proseSchema),
				mathInputRules,
				mathSelectPlugin,
				history(),
				gapCursor()
			]
		}
		// create prosemirror state (from file)
		let state:ProseEditorState;
		if(this._currentFile && this._currentFile.contents){
			state = this.parseContents(this._currentFile.contents);
		} else {
			state = ProseEditorState.create(config);
		}
		// create prosemirror instance
		let nodeViews: ICursorPosObserver[] = [];
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: state,
			nodeViews: {
				"math_inline": (node, view, getPos) => {
					let nodeView = new MathView(
						node, view, getPos as (() => number), { displayMode: false },
						() => { nodeViews.splice(nodeViews.indexOf(nodeView)); },
					);
					nodeViews.push(nodeView);
					return nodeView;
				},
				"math_display": (node, view, getPos) => {
					let nodeView = new MathView(
						node, view, getPos as (() => number), { displayMode: true },
						() => { nodeViews.splice(nodeViews.indexOf(nodeView)); }
					);
					nodeViews.push(nodeView);
					return nodeView;
				},
			},
			dispatchTransaction: (tr: Transaction): void => {
				let proseView:EditorView = (this._proseEditorView as EditorView);

				// update 
				for (let mathView of nodeViews) {
					mathView.updateCursorPos(proseView.state);
				}

				console.log("selection :: ", tr.selection.from, tr.selection.to)

				// apply transaction
				proseView.updateState(proseView.state.apply(tr));
			},
			handleClick: (view: ProseEditorView<any>, pos: number, event: MouseEvent) => {
				let node = view.state.doc.nodeAt(pos);
				if(node && event.ctrlKey && node.isText){
					let tag = node.text;
					if(!tag){ return false; }
					this._ipc.requestTagOpen(tag);
				}
				return true;
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

		let parsed = markdownParser.parse(contents);
		console.log(parsed);

		return ProseEditorState.create({
			doc: parsed,
			plugins: [
				// note: keymap order matters!
				keymap(buildKeymap_markdown(this._proseSchema)),
				keymap(baseKeymap),
				this._keymap,
				buildInputRules_markdown(this._proseSchema),
				mathInputRules,
				mathSelectPlugin,
				history(),
				gapCursor()
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