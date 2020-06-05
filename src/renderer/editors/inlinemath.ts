// ProseMirror imports
import { StepMap } from "prosemirror-transform"
import { keymap } from "prosemirror-keymap"
import { undo, redo } from "prosemirror-history"
import { EditorView, NodeView } from "prosemirror-view";
import { EditorState, Transaction, TextSelection } from "prosemirror-state";
import { Node as ProsemirrorNode, Fragment } from "prosemirror-model";
import katex, { ParseError } from "katex";

//// DISPLAY MATH //////////////////////////////////////////

export class InlineMathView implements NodeView {

	node: ProsemirrorNode;
	outerView: EditorView;
	innerView: (EditorView | null);
	getPos: (() => number);
	dom: HTMLElement;
	contents: HTMLElement;
	mathinput: (HTMLElement | null);

	constructor(node: ProsemirrorNode, view: EditorView, getPos: (() => number)) {
		this.node = node;
		this.outerView = view;
		this.getPos = getPos;

		// node representation in the editor
		this.dom = document.createElement("inlinemath");
		this.contents = document.createElement("span");
		this.contents.textContent = "";
		this.contents.classList.add("math-render");
		this.dom.appendChild(this.contents);

		this.render();
		//this.contentDOM = document.createElement("span");
		//this.dom.appendChild(this.contentDOM);
		// node used when display math is selected
		this.innerView = null;
		this.mathinput = null;
	}

	// selection -------------------------------------------

	setSelection(anchor: number, head: number) {
		console.log("set selection");
	}

	selectNode() {
		console.log("selected");
		this.dom.classList.add("ProseMirror-selectednode");
		if (!this.innerView) { this.open(); }
	}

	deselectNode() {
		console.log("deselected");
		this.dom.classList.remove("ProseMirror-selectednode");
		if (this.innerView) { this.close(); }
	}

	// NodeView::update(node)
	update(node: ProsemirrorNode) {
		if (!node.sameMarkup(this.node)) return false
		this.node = node;

		if (this.innerView) {
			let state = this.innerView.state

			let start = node.content.findDiffStart(state.doc.content)
			if (start != null) {
				let diff = node.content.findDiffEnd(state.doc.content as any);
				if (diff) {
					let { a: endA, b: endB } = diff;
					let overlap = start - Math.min(endA, endB)
					if (overlap > 0) { endA += overlap; endB += overlap }
					this.innerView.dispatch(
						state.tr
							.replace(start, endB, node.slice(start, endA))
							.setMeta("fromOutside", true))
				}
			}
		}

		this.render();

		return true
	}

	// lifecycle -------------------------------------------

	render() {
		let content = this.node.content.content;

		// get tex string to render
		let texString = "";
		if (content.length > 0 && content[0].textContent !== null) {
			texString = content[0].textContent;
		}

		// render katex, but fail gracefully
		try {
			katex.render(texString, this.contents);
		} catch (err) {
			if (err instanceof ParseError) {
				//TODO: show error in editor
				console.log(err);
			} else {
				throw err;
			}
		}
	}

	dispatchInner(tr: Transaction) {
		if (!this.innerView) { return; }
		let { state, transactions } = this.innerView.state.applyTransaction(tr)
		this.innerView.updateState(state)

		if (!tr.getMeta("fromOutside")) {
			let outerTr = this.outerView.state.tr, offsetMap = StepMap.offset(this.getPos() + 1)
			for (let i = 0; i < transactions.length; i++) {
				let steps = transactions[i].steps
				for (let j = 0; j < steps.length; j++) {
					let mapped = steps[j].map(offsetMap);
					if (!mapped) { throw Error("step discarded!"); }
					outerTr.step(mapped)
				}
			}
			if (outerTr.docChanged) this.outerView.dispatch(outerTr)
		}
	}

	open() {
		// Append a tooltip to the outer node
		let mathinput = this.dom.appendChild(document.createElement("div"))
		mathinput.className = "math-src"
		this.mathinput = mathinput;

		if (this.innerView) {
			throw Error("inner view should not exist!");
		}

		// And put a sub-ProseMirror into that
		this.innerView = new EditorView(mathinput, {
			// You can use any node as an editor document
			state: EditorState.create({
				doc: this.node,
				plugins: [keymap({
					"Mod-z": () => undo(this.outerView.state, this.outerView.dispatch),
					"Mod-y": () => redo(this.outerView.state, this.outerView.dispatch)
				})]
			}),
			// This is the magic part
			dispatchTransaction: this.dispatchInner.bind(this),
			// seems not to be necessary?
			handleDOMEvents: {
				"mousedown": (view, evt) => {
					// Kludge to prevent issues due to the fact that the whole
					// footnote is node-selected (and thus DOM-selected) when
					// the parent editor is focused.
					if (!this.innerView) { return false; }
					if (this.outerView.hasFocus()) this.innerView.focus()
					return false;
					return false;
				}
			}
		})

		let outerState = this.outerView.state;
		let innerState = this.innerView.state;

		console.log("\n\n\nSTART SELECTION\n")
		console.log(this.node);
		console.log(outerState.selection,
			outerState.selection.$from.pos,
			outerState.selection.$to.pos,
			outerState.selection.$anchor.pos,
			outerState.selection.$head.pos)
		console.log(innerState.selection,
			innerState.selection.$from.pos,
			innerState.selection.$to.pos,
			innerState.selection.$anchor.pos,
			innerState.selection.$head.pos)
		//this.innerView.focus();

		console.log(this.getPos())

		/*this.innerView.dispatch(
			this.innerView.state.tr.setSelection(
				TextSelection.create(
					this.innerView.state.doc, 3, 6)));*/
	}

	close() {
		if (this.innerView) {
			this.innerView.destroy();
			this.innerView = null;
		}
		if (this.mathinput) {
			this.dom.removeChild(this.mathinput);
			this.mathinput = null;
		}
	}

	destroy() {
		if (this.innerView) this.close();
	}

	stopEvent(event: Event): boolean {
		return (this.innerView !== null)
			&& (event.target !== undefined)
			&& this.innerView.dom.contains(event.target as Node);
	}

	ignoreMutation() { return true }
}