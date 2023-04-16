// TODO (Ben @ 2023/04/03) compare with Brian Hung's version,
// which includes asynchronous loading of languages
// https://gist.github.com/BrianHung/222b870dfe7917a9a4d73d8c42db03cc

// TODO (Ben @ 2023/04/04) also experiment with prosemirror-highlightjs
// https://github.com/b-kelly/prosemirror-highlightjs

// codemirror
import * as CV  from "@codemirror/view"
import * as CC  from "@codemirror/commands"
import * as CL  from "@codemirror/language"
import * as CS  from "@codemirror/state"

// prosemirror
import * as PC from "prosemirror-commands"
import * as PH from "prosemirror-history"
import * as PS from "prosemirror-state"
import * as PV from "prosemirror-view"
import * as PM from "prosemirror-model"

// noteworthy
// TODO (Ben @ 2023/04/15) try to eliminate the need to import CodeBlockExtension
import { ExtensionNodeAttrs } from "@common/extensions/extension";
import { CodeBlockExtension } from "@common/extensions/node-extensions";

// noteworthy-codemirror-preview
import { getCodeMirrorLanguage } from "./codemirror-utils";
import { PreviewRenderer } from "./codemirror-preview-types";
import { AttrStep } from "./prosemirror-utils";

//// OPTIONS ///////////////////////////////////////////////

interface BaseOptions {

}

type PlainOptions = BaseOptions & {
	mode: "default"
}

type WithPreviewOptions = BaseOptions & {
	mode: "preview",
	previewRenderers: { [lang:string] : PreviewRenderer }
}

export type CodeViewOptions = PlainOptions | WithPreviewOptions;

export const defaultCodeViewOptions: CodeViewOptions = {
	mode: "default"
}

//// NODE VIEW IMPLEMENTATION //////////////////////////////

interface PreviewState {
	dom: HTMLElement;
	visible: boolean;
}

const CLASS_VISIBLE = "visible";
const CLASS_HIDDEN = "hidden";

/**
 * Code and comments for `CodeMirrorView` were adapted from:
 * https://prosemirror.net/examples/codemirror/
 */
export class CodeMirrorView implements PV.NodeView {

	private _codeMirror: CV.EditorView;
	
	/** used to avoid an update loop between the outer and inner editor */
	private _updating: boolean = false;

	/** the NodeView's DOM representation */
	private _lang: string|null;
	private _langCompartment: CS.Compartment;
	private _langLabel: HTMLInputElement;
	public dom: Node|null = null;

	/** preview pane */
	private _preview: PreviewState;

	constructor(
		private _node: PM.Node,
		private _proseView: PV.EditorView,
		private _getPos: (() => number),
		private _options: CodeViewOptions = defaultCodeViewOptions
	) {

		// extensions without lang
		const extensionsWithoutLang = [
				CV.keymap.of([
					...this.codeMirrorKeymap(),
					...CC.defaultKeymap
				]),
				CV.drawSelection(),
				CL.syntaxHighlighting(CL.defaultHighlightStyle),
				CV.EditorView.updateListener.of(update => this.forwardUpdate(update))
			]
		
		// determine language
		this._lang = this._node.attrs["lang"] || null;
		const lang = getCodeMirrorLanguage(this._lang);

		// placeholder allowing the CodeMirror language to change dynamically
		this._langCompartment = new CS.Compartment();
		const langExtension = this._langCompartment.of(lang || []);

		// PASTE 
		const eventHandlers = CV.EditorView.domEventHandlers({
			paste(event, view) {
				console.log("codeMirror :: paste ::", event);
			}
		})

		// configure codemirror
		this._codeMirror = new CV.EditorView({
			doc: this._node.textContent,
			extensions: [...extensionsWithoutLang, langExtension, eventHandlers],
		})

		// lang label
		const langLabel = document.createElement("input");
		langLabel.className = "langLabel"
		langLabel.value = this._lang || "";
		
		const nodeView = this;
		langLabel.addEventListener("input", function (event) {
			const lang = this.value;
			nodeView.handleUserChangedLang(lang);
		});

		this._langLabel = langLabel;

		// configure preview pane
		const previewDom = document.createElement("div");
		previewDom.className = `codeView-preview ${CLASS_HIDDEN}`;
		this._preview = {
			dom: previewDom,
			visible: false
		};

		// nodeview DOM representation
		const codeDom = document.createElement("div");
		if(this._lang) { codeDom.dataset.lang = this._lang; }
		codeDom.className = "codeView-code";

		codeDom.appendChild(this._langLabel);
		codeDom.appendChild(this._codeMirror.dom);

		const dom = document.createElement("div");
		dom.className = "codeView";
		dom.appendChild(this._preview.dom); 
		dom.appendChild(codeDom);
		this.dom = dom;
	}

	/* ==== NodeView implementation ======================= */

	selectNode() {
		console.log("codeView :: selectNode");
		this.hidePreview();
		this.showCodeMirror();
		this._codeMirror.focus();
	}

	deselectNode() {
		console.log("codeView :: deselectNode");
		this.renderPreview();
		this.hideCodeMirror();
	}

	stopEvent(event: Event) {
		console.log("codeView :: stopEvent", event);
		return true;
	}

	setSelection(anchor: number, head: number) {
		console.log("codeView :: setSelection");
		/*
		* The `setSelection` method on a node view will be called when ProseMirror
		* tries to put the selection inside the node. Our implementation makes sure
		* the CodeMirror selection is set to match the position that is passed in.
		*/
		this._codeMirror.focus();
		this._updating = true;
		this._codeMirror.dispatch({selection: {anchor, head}});
		this._updating = false;
	}

	update(node: PM.Node): boolean {
		console.log("codeView :: update");
		/*
		 * When a node update comes in from ProseMirror, for example because of an
		 * undo action, we sort of have to do the inverse of what forwardUpdate did--
		 * check for text changes, and if present, propagate them from the outer to
		 * the inner editor.
		 *
		 * To avoid needlessly clobbering the state of the inner editor, this method
		 * only generates a replacement for the range of the content that was changed,
		 * by comparing the start and end of the old and new content.
		 */

		if (node.type != this._node.type) return false;
		this._node = node;

		// update attrs
		let newLang = (node.attrs as ExtensionNodeAttrs<CodeBlockExtension>).lang;
		this.handleProseMirrorChangedLang(newLang);

		// update text
		if (this._updating) return true;
		let newText = node.textContent;
		let curText = this._codeMirror.state.doc.toString();

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

	/* ==================================================== */

	getLang(): string|null {
		return this._lang;
	}

	/** Returns a string containing the contents of this code block. */
	getCode(): string {
		let content = this._node.content.content;
		let code = "";
		if (content.length > 0 && content[0].textContent !== null) {
			code = content[0].textContent.trim();
		}
		return code;
	}

	/* ==== LANGUAGE ====================================== */

	/**
	 * React to changes in the `lang` attribute of the ProseMirror node for this
	 * code block.  Dispatches updates to CodeMirror. */
	private handleProseMirrorChangedLang(lang: string|null): void {
		// update internal state
		if(lang === this._lang) { return; }
		this._lang = lang;

		// react to change
		this.clearPreview();
		this.updateCodeMirrorLanguage(getCodeMirrorLanguage(this._lang));
	}

	/**
	 * React to changes in the `lang` attribute of the ProseMirror node for this
	 * code block.  Dispatches updates to both CodeMirror and ProseMirror. */
	private handleUserChangedLang(lang: string): void {
		// update internal state
		if(lang === this._lang) { return; }
		this._lang = lang || null;

		// react to change
		this.clearPreview();
		this.updateProseNodeLangAttr(this._lang || "");
		this.updateCodeMirrorLanguage(getCodeMirrorLanguage(this._lang));
	}

	/**
	 * Set the `lang` attribute of the ProseMirror node for this code block.
	 */
	private updateProseNodeLangAttr(lang: string): void {
		console.log("codeView :: updateNodeLangAttr", `lang=${lang}`);

		// update nodeview lang
		if(lang === this._lang) { return; }
		this._lang = lang;

		// set lang attribute of prosemirror ndoe
		let step = new AttrStep(this._getPos(), "lang", lang);
		let tr = this._proseView.state.tr.step(step);
		this._proseView.dispatch(tr);
	}

	private updateCodeMirrorLanguage(lang: CL.Language|null) {
		console.log("codeView :: updateCodeMirrorLanguage");
		this._updating = true;
		this._codeMirror.dispatch({
			effects: this._langCompartment.reconfigure(lang || [])
		});
		this._updating = false;
	}

	/* ==== PREVIEW ======================================= */

	getPreviewRenderer(lang: string): PreviewRenderer | null {
		if(this._options.mode === "preview") {
			console.log(`finding renderer for lang=${lang}`, this._options.previewRenderers); 
			return this._options.previewRenderers[lang] || null;
		} else {
			console.log("%c\n\n\nPREVIEW DISABLED\n\n\n", "color:red");
			return null;
		}
	}

	/** Set the contents of the preview pane by calling one of the registered renderers. */
	renderPreview() {
		// get code contents
		const code = this.getCode();
		const lang = this.getLang();

		console.log("codeView :: renderPreview", code, `lang=${lang}`);

		// select renderer
		const renderFn = !lang ? null : this.getPreviewRenderer(lang);
		if(renderFn !== null) {
			renderFn(this._preview.dom, code);
			this.showPreview();
		} else {
			this.hidePreview();
			this.clearPreview();
		}
	}

	/** Erase the contents of the preview pane. */
	clearPreview() {
		console.log("codeView :: clearPreview");
		this._preview.dom.innerHTML = "";
	}

	showPreview() {
		console.log("codeView :: showPreview");
		this._preview.dom.classList.remove(CLASS_HIDDEN);
		this._preview.dom.classList.add(CLASS_VISIBLE);
		this._preview.visible = true;
	}

	hidePreview() {
		console.log("codeView :: hidePreview");
		this._preview.dom.classList.remove(CLASS_VISIBLE);
		this._preview.dom.classList.add(CLASS_HIDDEN);
		this._preview.visible = false;

		this._preview.dom.textContent = "hidden";
	}

	ensurePreviewHidden() {
		if(this._preview.visible) { this.hidePreview(); }
	}

	ensurePreviewVisible() {
		if(!this._preview.visible) { this.showPreview(); }
	}

	showCodeMirror() {

	}

	hideCodeMirror() {

	}

	/* ==================================================== */

	/**
	 * When the code editor is focused, translate any update that changes the
	 * document or selection to a ProseMirror transaction. The `getPos` that was
	 * passed to the node view can be used to find out where our code content
	 * starts, relative to the outer document.
	 */
	forwardUpdate(update: CV.ViewUpdate): void {
		// manage preview visibility
		if(update.focusChanged) {
			if(this._codeMirror.hasFocus) { this.ensurePreviewHidden(); }
			else                          { this.renderPreview();       } 
		}

		// ignore updates whenever codemirror editor is out of focus
		if (this._updating || !this._codeMirror.hasFocus) return;

		let codePos = this._getPos();
		let tr = this._proseView.state.tr;

		if (update.docChanged) {
			// the +1 skips the code block opening token
			let offset = codePos + 1;
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
		}

		// update selection
		let { main: codeMirrorSelection} = update.state.selection; 
		let codePosAfterTr = tr.mapping.map(codePos);
		let mappedProseSelection = this._proseView.state.selection.map(tr.doc, tr.mapping);
		let desiredProseSelection =
			PS.TextSelection.create(
				tr.doc,
				codePosAfterTr + 1 + codeMirrorSelection.from, // +1 skips code_block start token
				codePosAfterTr + 1 + codeMirrorSelection.to    // +1 skips code_block start token
			);
		if(!mappedProseSelection.eq(desiredProseSelection)) {
			tr = tr.setSelection(desiredProseSelection);
		}
		
		this._proseView.dispatch(tr)
	}

	//// CODEMIRROR KEYMAP ///////////////////////////////////


	codeMirrorKeymap() {
		let view = this._proseView;
		return [
			{key: "ArrowUp",    run: () => this.maybeEscape("line", -1)},
			{key: "ArrowLeft",  run: () => this.maybeEscape("char", -1)},
			{key: "ArrowDown",  run: () => this.maybeEscape("line",  1)},
			{key: "ArrowRight", run: () => this.maybeEscape("char",  1)},
			{key: "Backspace",  run: () => this.handleBackspace() },
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
		// cannot escape when selection was nonempty
		let {state} = this._codeMirror;
		if(!state.selection.main.empty) { return false; }

		let mainSelection = state.selection.main;
		let range: { from: number, to: number };
		if(unit === "line") { range = state.doc.lineAt(state.selection.main.head); }
		else                { range = mainSelection; }

		// if movement does not bring cursor over edge, no escape
		if (dir < 0 ? range.from > 0 : range.to < state.doc.length) { return false; }
		
		let targetPos = this._getPos() + (dir < 0 ? 0 : this._node.nodeSize)
		let selection = PS.Selection.near(this._proseView.state.doc.resolve(targetPos), dir)
		let tr = this._proseView.state.tr.setSelection(selection).scrollIntoView();
		this._proseView.dispatch(tr)
		this._proseView.focus();

		return true;
	}

	/**
	 * Determine if the specified cursor movement will "escape" the NodeView or not.
	 */
	handleBackspace(): boolean {
		// cannot escape when selection was nonempty
		let {state} = this._codeMirror;
		if(!state.selection.main.empty)   { return false; }
		if(state.selection.main.to !== 0) { return false; }

		let pos = this._getPos();

		// replace code_block with text node
		let tr = this._proseView.state.tr.insertText(this._node.textContent, pos, pos + this._node.nodeSize);
		// place selection before new text node
		tr = tr.setSelection(PS.TextSelection.create(tr.doc, pos)).scrollIntoView();
		
		this._proseView.dispatch(tr)
		this._proseView.focus();

		return true;
	}

}