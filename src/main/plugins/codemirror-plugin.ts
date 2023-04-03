// codemirror
import * as CV  from "@codemirror/view"
import * as CC  from "@codemirror/commands"
import * as CL  from "@codemirror/language"
import * as CJS from "@codemirror/lang-javascript"

// prosemirror
import { PluginKey, PluginSpec, Plugin as ProsePlugin, EditorState, Transaction, TextSelection } from "prosemirror-state";
import * as PC from "prosemirror-commands"
import * as PH from "prosemirror-history"
import * as PS from "prosemirror-state"
import * as PV from "prosemirror-view"
import * as PM from "prosemirror-model"

//// PROSEMIRROR NODE VIEW /////////////////////////////////

/**
 * Code and comments for `CodeMirrorView` were adapted from:
 * https://prosemirror.net/examples/codemirror/
 */
class CodeMirrorView implements PV.NodeView {

	private _codeMirror: CV.EditorView;
	
	/** used to avoid an update loop between the outer and inner editor */
	private _updating: boolean = false;

	/** the NodeView's DOM representation */
	public dom: Node|null = null;

	constructor(
		private _node: PM.Node,
		private _proseView: PV.EditorView,
		private _getPos: (() => number)
	) {
		this._codeMirror = new CV.EditorView({
			doc: this._node.textContent,
			extensions: [
				CV.keymap.of([
					...this.codeMirrorKeymap(),
					...CC.defaultKeymap
				]),
				CV.drawSelection(),
				CL.syntaxHighlighting(CL.defaultHighlightStyle),
				CJS.javascript(),
				CV.EditorView.updateListener.of(update => this.forwardUpdate(update))
			]
		})

    // The editor's outer node is our DOM representation
    this.dom = this._codeMirror.dom;
	}

	/**
	 * When the code editor is focused, translate any update that changes the
	 * document or selection to a ProseMirror transaction. The `getPos` that was
	 * passed to the node view can be used to find out where our code content
	 * starts, relative to the outer document (the + 1 skips the code block
	 * opening token).
	 */
	forwardUpdate(update: CV.ViewUpdate): void {
		if (this._updating || !this._codeMirror.hasFocus) return;

		let offset = this._getPos() + 1, {main} = update.state.selection;
		let selection =
			TextSelection.create(
				this._proseView.state.doc,
				offset + main.from,
				offset + main.to
			);

		if (update.docChanged || !this._proseView.state.selection.eq(selection)) {
			let tr = this._proseView.state.tr.setSelection(selection);
			update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
				if (text.length) {
					tr.replaceWith(
						offset + fromA,
						offset + toA,
						this._proseView.state.schema.text(text.toString())
					);
				} else {
					tr.delete(offset + fromA, offset + toA)
				}
				offset += (toB - fromB) - (toA - fromA)
			})
			this._proseView.dispatch(tr)
		}
	}

	/**
	 * The `setSelection` method on a node view will be called when ProseMirror
	 * tries to put the selection inside the node. Our implementation makes sure
	 * the CodeMirror selection is set to match the position that is passed in.
	 */
	setSelection(anchor: number, head: number) {
		this._codeMirror.focus();
		this._updating = true;
		this._codeMirror.dispatch({selection: {anchor, head}});
		this._updating = false;
	}

	codeMirrorKeymap() {
		let view = this._proseView;
		return [
			{key: "ArrowUp",    run: () => this.maybeEscape("line", -1)},
			{key: "ArrowLeft",  run: () => this.maybeEscape("char", -1)},
			{key: "ArrowDown",  run: () => this.maybeEscape("line",  1)},
			{key: "ArrowRight", run: () => this.maybeEscape("char",  1)},
			{key: "Ctrl-Enter", run: () => {
				if (!PC.exitCode(view.state, view.dispatch)) return false
				view.focus()
				return true
			}},
			{key: "Ctrl-z",       mac: "Cmd-z",       run: () => PH.undo(view.state, view.dispatch)},
			{key: "Shift-Ctrl-z", mac: "Shift-Cmd-z", run: () => PH.redo(view.state, view.dispatch)},
			{key: "Ctrl-y",       mac: "Cmd-y",       run: () => PH.redo(view.state, view.dispatch)}
		]
	}

	/**
	 * Determine if the specified cursor movement will "escape" the NodeView or not.
	 */
	maybeEscape(unit: "line"|"char", dir: 1|0|-1): boolean {
		let {state} = this._codeMirror;

		// cannot escape when selection was nonempty
		if(!state.selection.main.empty) { return false; }
		
		// 
		let mainSelection = state.selection.main;
		let range: { from: number, to: number };
		if(unit === "line") { range = state.doc.lineAt(state.selection.main.head); }
		else                { range = mainSelection; }

		// if movement does not bring cursor over edge, no escape
		if (dir < 0 ? range.from > 0 : range.to < state.doc.length) { return false; }
		
		let targetPos = this._getPos() + (dir < 0 ? 0 : this._node.nodeSize)
		let selection = PS.Selection.near(this._proseView.state.doc.resolve(targetPos), dir)
		
		let tr = this._proseView.state.tr.setSelection(selection).scrollIntoView()
		this._proseView.dispatch(tr)
		this._proseView.focus();

		return true;
	}

	/**
	 * When a node update comes in from ProseMirror, for example because of an
	 * undo action, we sort of have to do the inverse of what forwardUpdate did--
	 * check for text changes, and if present, propagate them from the outer to
	 * the inner editor.
	 *
	 * To avoid needlessly clobbering the state of the inner editor, this method
	 * only generates a replacement for the range of the content that was changed,
	 * by comparing the start and end of the old and new content.
	 */
	update(node: PM.Node): boolean {
		if (node.type != this._node.type) return false;
		this._node = node;

		if (this._updating) return true;
		let newText = node.textContent, curText = this._codeMirror.state.doc.toString()
		if (newText != curText) {
			let start = 0, curEnd = curText.length, newEnd = newText.length;
			while (start < curEnd &&
						curText.charCodeAt(start) == newText.charCodeAt(start)) {
				++start;
			}
			while (curEnd > start && newEnd > start &&
						curText.charCodeAt(curEnd - 1) == newText.charCodeAt(newEnd - 1)) {
				curEnd--;
				newEnd--;
			}
			this._updating = true;
			this._codeMirror.dispatch({
				changes: {
					from: start, to: curEnd,
					insert: newText.slice(start, newEnd)
				}
			});
			this._updating = false;
		}
		return true;
	}

	selectNode() { this._codeMirror.focus(); }
	stopEvent() { return true; }
}

//// PROSEMIRROR PLUGIN ////////////////////////////////////

namespace CodeMirrorPlugin {

	export interface Options {
		// empty
	}

	export interface State {
		// empty
	}

}

let codeMirrorPluginKey = new PluginKey<CodeMirrorPlugin.State>("noteworthy-codemirror");

export const codemirrorPlugin = (options: CodeMirrorPlugin.Options): PS.Plugin<CodeMirrorPlugin.State> => {
	
	let pluginSpec: PS.PluginSpec<CodeMirrorPlugin.State> = {
		key: codeMirrorPluginKey,
		state: {
			init(config, instance): CodeMirrorPlugin.State {
				return { };
			},
			apply(tr, value, oldState, newState){
				return value;
			},
		},
		props: {
			nodeViews: {
				"code_block" : (node: PM.Node, view: PV.EditorView, getPos:boolean|(()=>number)): CodeMirrorView => {
					console.log("\n\n\ncreating codemirror node view\n\n\n");
					let nodeView = new CodeMirrorView(node, view, getPos as (() => number));
					return nodeView;
				}
			}
		}
	}
	
	return new PS.Plugin(pluginSpec);
}