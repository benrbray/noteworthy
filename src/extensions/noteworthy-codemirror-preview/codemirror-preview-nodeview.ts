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

interface State {
	previewVisible: boolean;
	editorFocused: boolean;
}

const CLASS_VISIBLE = "visible";
const CLASS_HIDDEN = "hidden";

/**
 * Code and comments for `CodeMirrorView` were adapted from:
 * https://prosemirror.net/examples/codemirror/
 */
export class CodeMirrorView implements PV.NodeView {

	private _codeMirror: CV.EditorView|null = null;
	
	/* ---- nodeview state ---- */

	private _lang: string|null;
	/** used to avoid an update loop between the outer and inner editor */
	private _updating: boolean = false;

	/* ---- codemirror ---- */

	private _langCompartment: CS.Compartment;

	/* ---- nodeview dom ---- */

	public dom: Node|null = null;

	private _dom: {
		langLabel        : HTMLInputElement;
		codeDom          : HTMLDivElement;
		codeMirrorHolder : HTMLSpanElement;
		preview          : HTMLSpanElement;
	} | null = null;

	/* ---- preview state ---- */
	
	private _state: State;

	constructor(
		private _node: PM.Node,
		private _proseView: PV.EditorView,
		private _getPos: (() => number),
		private _options: CodeViewOptions = defaultCodeViewOptions
	) {
		// determine language
		this._lang = this._node.attrs["lang"] || null;

		// placeholder allowing the CodeMirror language to change dynamically
		this._langCompartment = new CS.Compartment();
		
		// TODO (Ben @ 2023/04/16) correct initial value for editorActive?  what if initial selection lies within code block?
		this._state = {
			previewVisible: false,
			editorFocused: false
		};

		// initialize
		this.initDom();
		this.createCodeMirrorView();

		// initialize preview state
	}

	/**
	 * Initialize the NodeView's DOM.
	 * Intended to be called exactly once, during initialization.
	 */
	private initDom(): void {
		// lang label
		const langLabel = document.createElement("input");
		langLabel.className = "langLabel"
		langLabel.value = this._lang || "";
		langLabel.addEventListener("blur", () => this.handleLangLabelLostFocus());
		langLabel.addEventListener("focus", () => this.handleLangLabelGainedFocus());

		const nodeView = this;
		langLabel.addEventListener("input", function (event) {
			const lang = this.value;
			nodeView.handleUserChangedLang(lang);
		});

		// preview pane
		const previewDom = document.createElement("span");
		previewDom.className = `codeView-preview ${CLASS_HIDDEN}`;
		previewDom.addEventListener("click", () => { this.handlePreviewClicked(); });

		// nodeview DOM representation
		const codeDom = document.createElement("div");
		codeDom.className = "codeView-code";
		codeDom.appendChild(langLabel);

		const codeMirrorDom = document.createElement("span");
		codeMirrorDom.className = "codeView-codeMirror";
		codeDom.appendChild(codeMirrorDom);

		const dom = document.createElement("div");
		dom.className = "codeView";
		dom.appendChild(previewDom); 
		dom.appendChild(codeDom);
		this.dom = dom;

		// save dom elements for later
		this._dom = {
			langLabel: langLabel,
			preview: previewDom,
			codeDom: codeDom,
			codeMirrorHolder: codeMirrorDom
		}
	}

	private createCodeMirrorView(): void {
		if(this._codeMirror) { return; }
		if(!this._dom)       { return; }

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

		const lang = getCodeMirrorLanguage(this.getLang());
		const langExtension = this._langCompartment.of(lang || []);

		this._codeMirror = new CV.EditorView({
			doc: this._node.textContent,
			extensions: [...extensionsWithoutLang, langExtension],
		});

		this._dom.codeMirrorHolder.replaceChildren(this._codeMirror.dom);
	}

	private destroyCodeMirrorView(): void {
		if(this._codeMirror) {
			this._codeMirror.destroy();
			this._codeMirror = null;

			if(this._dom) { this._dom.codeMirrorHolder.replaceChildren(); }
		}
	}

	/**
	 * Update the ProseMirror view with a NodeSelection around this NodeView.
	 * Useful for bringing focus to this NodeView.
	 */
	private selectProseNode() {
		let tr = this._proseView.state.tr;
		tr.setSelection(PS.NodeSelection.create(tr.doc, this._getPos()));
		this._proseView.dispatch(tr);
	}

	/* ==== NodeView implementation ======================= */

	selectNode() {
		console.log("codeView :: selectNode");
		this.hidePreview();
		this.openCodeMirrorEditor();
		this._codeMirror?.focus();
	}

	deselectNode() {
		console.log("codeView :: deselectNode");
		this.closeEditorIfPreviewAvailableOtherwiseOpen();
	}

	stopEvent(event: Event) {
		return true;
	}

	setSelection(anchor: number, head: number) {
		console.log("codeView :: setSelection");
		/*
		* The `setSelection` method on a node view will be called when ProseMirror
		* tries to put the selection inside the node. Our implementation makes sure
		* the CodeMirror selection is set to match the position that is passed in.
		*/

		// open codemirror node if not exists
		this.createCodeMirrorView();
		if(!this._codeMirror) { return; }

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

		// if there is no active codemirror view, there is nothing left to do
		if(!this._codeMirror) { return true; }
		// avoid update cycles & race conditions
		if (this._updating) return true;

		// otherwise, we need to propagate the changes from ProseMirror
		// into the CodeMirror view so that the editor shows the latest text
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

	/* ==== LANGUAGE ====================================== */

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

	/**
	 * Set the `lang` attribute of the ProseMirror node for this code block.
	 */
	private updateProseNodeLangAttr(lang: string): void {
		console.log("codeView :: updateNodeLangAttr", `lang=${lang}`);

		let step = new AttrStep(this._getPos(), "lang", lang);
		let tr = this._proseView.state.tr.step(step);
		this._proseView.dispatch(tr);
	}

	private updateCodeMirrorLanguage(lang: CL.Language|null): void {
		console.log("codeView :: updateCodeMirrorLanguage");
		if(!this._codeMirror) { return; }

		this._updating = true;
		this._codeMirror.dispatch({
			effects: this._langCompartment.reconfigure(lang || [])
		});
		this._updating = false;
	}

	/* ==== EVENTS ======================================== */

	/**
	 * Triggered when the user clicks on the NodeView.
	 */
	private handlePreviewClicked(): void {
		this.openCodeMirrorEditor();
		this.hidePreview();
		this.selectProseNode();
	}

	/**
	 * React to changes in the `lang` attribute of the ProseMirror node for this
	 * code block.  Dispatches updates to CodeMirror. */
	private handleProseMirrorChangedLang(lang: string|null): void {
		// update internal state
		if(lang === this._lang) { return; }
		this._lang = lang;

		// react to change
		this.updateCodeMirrorLanguage(getCodeMirrorLanguage(this._lang));
		this.clearPreview();
		this.handlePreviewRequiresUpdate();
	}

	/**
	 * React to changes in the `lang` attribute of the ProseMirror node for this
	 * code block.  Dispatches updates to both CodeMirror and ProseMirror. */
	private handleUserChangedLang(lang: string): void {
		// update internal state
		if(lang === this._lang) { return; }
		this._lang = lang || null;

		// react to change
		this.updateProseNodeLangAttr(this._lang || "");
		this.updateCodeMirrorLanguage(getCodeMirrorLanguage(this._lang));
		this.clearPreview();
		this.handlePreviewRequiresUpdate();
	}

	/**
	 * Should be called whenever the preview is stale and needs a refresh.
	 * If the render is currently visible, it will be updated.
	 * No change will be made to the visibility of the preview or editor.
	 */
	handlePreviewRequiresUpdate() {
		this.clearPreview();
		let renderSuccessful = this.renderPreviewIfAvailable();
	}

	/**
	 * Triggered when the CodeMirror view gains focus.
	 */
	handleCodeMirrorGainedFocus() {
		console.log(`%ccodeMirrorPreview :: handleCodeMirrorGainedFocus`, "color:blue");
		this.handleEditorGainedFocus();
	}

	/**
	 * Triggered when the CodeMirror view loses focus.
	 */
	handleCodeMirrorLostFocus() {
		console.log(`%ccodeMirrorPreview :: handleCodeMirrorLostFocus`, "color:blue");
		// if the langLabel currently has focus, keep the editor open
		if(this._dom && document.activeElement === this._dom.langLabel) { return; }
		// otherwise, focus has left the editor
		this.handleEditorLostFocus();
	}

	handleLangLabelGainedFocus() {
		this.handleEditorGainedFocus();
	}

	handleLangLabelLostFocus() {
		console.log(`%ccodeMirrorPreview :: handleLangLabelLostFocus`, "color:blue");
		// do nothing if focus moved to CodeMirror view
		if(this._codeMirror && this._codeMirror.hasFocus) { return; }
		// otherwise, focus has left the editor
		this.handleEditorLostFocus();
	}

	handleEditorGainedFocus() {
		this._state.editorFocused = true;
		this.hidePreview();
		this.openCodeMirrorEditor();
	}

	handleEditorLostFocus() {
		console.log(`%ccodeMirrorPreview :: handleEditorLostFocus`, "color:blue");
		this._state.editorFocused = false;
		this.closeEditorIfPreviewAvailableOtherwiseOpen();
	}

	/* ==================================================== */
	/**
	 * If a preview is available for this code block,
	 *   render the preview and collapse the CodeMirror editor.
	 * If no preview is available,
	 *   keep the CodeMirror editor open if it's already open,
	 *   or open it if it's currently closed.
	 *
	 * @returns `true` the preview was rendered, `false` otherwise.
	 */
	closeEditorIfPreviewAvailableOtherwiseOpen() {
		console.log(`codeMirrorPreview :: closeEditorIfPreviewAvailableOtherwiseOpen`);
		const renderSuccessful = this.closeEditorIfPreviewAvailable();
		if(!renderSuccessful) {
			this.openCodeMirrorEditor();
		}
	}

	/**
	 * If a preview is available for this code block,
	 *   render the preview and collapse the CodeMirror editor.
	 * If no preview is available,
	 *   make no change to the CodeMirror editor visibility.
	 *
	 * @returns `true` the preview was rendered, `false` otherwise.
	 */
	closeEditorIfPreviewAvailable(): boolean {
		console.log(`codeMirrorPreview :: closeEditorIfPreviewAvailable`);
		this.showPreview();
		const renderSuccessful: boolean = this.renderPreviewIfAvailable();
		console.log(`%crenderSuccessful = ${renderSuccessful}`, "color:red")

		if(renderSuccessful) {
			this.closeCodeMirrorEditor();
			return true;
		} else {
			this.hidePreview();
			return false;
		}
	}

	/**
	 * Call the render function for the current language, if available.
	 * Requires that the preview DOM is already visible.
	 * @returns `true` if the render was successful, `false` otherwise.
	 */
	private renderPreviewIfAvailable(): boolean {
		// get code contents
		const code = this.getCode();
		const lang = this.getLang();
		console.log(`codeMirrorPreview :: renderPreviewIfAvailable :: lang=${lang}, code=${code}`);
		if(!this._dom) { console.warn("no dom!"); return false; }

		if(!this._state.previewVisible)      { console.warn("no preview!"); return false; }
		if(this._options.mode !== "preview") { console.warn("preview disabled!"); return false; }
		if(!lang)                            { console.warn("no lang!"); return false; }

		// check if lang has a preview renderer defined
		let rendererFn = this._options.previewRenderers[lang];
		if(!rendererFn) { console.warn(`no renderer for lang=${lang}`); return false; }

		// if so, collapse the editor and render the preview
		return rendererFn(this._dom.preview, code);
	}

	/* ==== PREVIEW ======================================= */

	/** Erase the contents of the preview pane. */
	private clearPreview() {
		if(!this._dom) { return; }
		console.log("codeView :: clearPreview");
		this._dom.preview.innerHTML = "";
	}

	/**
	 * Performs only the steps needed to make the preview visible.
	 * Idempotent.  Does not update preview contents.  
	 * 
	 * (**Warning:** Internal use only.  May break invariants if not called responsibly.)
	 */
	private showPreview() {
		if(!this._dom) { return; }
		console.log("codeView :: showPreview");

		this._dom.preview.classList.remove(CLASS_HIDDEN);
		this._dom.preview.classList.add(CLASS_VISIBLE);
		this._state.previewVisible = true;
	}

	/**
	 * Performs only the steps needed to hide the preview.
	 * Idempotent.  Does not update preview contents.  
	 * 
	 * (**Warning:** Internal use only.  May break invariants if not called responsibly.)
	 */
	private hidePreview() {
		if(!this._dom) { return; }
		console.log("codeView :: hidePreview");

		this._dom.preview.classList.remove(CLASS_VISIBLE);
		this._dom.preview.classList.add(CLASS_HIDDEN);
		this._dom.preview.textContent = "";
		this._state.previewVisible = false;
	}

	private openCodeMirrorEditor() {
		this.createCodeMirrorView();
		this.showCodeDom();
	}

	private closeCodeMirrorEditor() {
		this.destroyCodeMirrorView();
		this.hideCodeDom();
	}

	private showCodeDom() {
		// show code dom
		if(!this._dom) { return; }
		this._dom.codeDom.classList.remove(CLASS_HIDDEN);
	}

	private hideCodeDom() {
		// hide code dom
		if(!this._dom) { return; }
		this._dom.codeDom.classList.add(CLASS_HIDDEN);
	}

	/* ==================================================== */

	/**
	 * When the code editor is focused, translate any update that changes the
	 * document or selection to a ProseMirror transaction. The `getPos` that was
	 * passed to the node view can be used to find out where our code content
	 * starts, relative to the outer document.
	 */
	forwardUpdate(update: CV.ViewUpdate): void {
		console.log("codeMirrorView :: forwardUpdate");

		if(!this._codeMirror) { return; }

		// ignore updates whenever codemirror editor is out of focus
		// (however, we still handle document changes when the focus has just changed)
		if (this._updating || (!update.focusChanged && !this._codeMirror.hasFocus)) { return; }

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

		// manage preview visibility
		if(update.focusChanged) {
			if(this._codeMirror.hasFocus) { this.handleCodeMirrorGainedFocus(); }
			else                          { this.handleCodeMirrorLostFocus();   }
		}
		
		this._proseView.dispatch(tr)
	}

	//// CODEMIRROR KEYMAP ///////////////////////////////////


	codeMirrorKeymap(): CV.KeyBinding[] {
		let view = this._proseView;
		return [
			{key: "ArrowUp",    run: () => this.maybeEscape("line", -1)},
			{key: "ArrowLeft",  run: () => this.maybeEscape("char", -1)},
			{key: "ArrowDown",  run: () => this.maybeEscape("line",  1)},
			{key: "ArrowRight", run: () => this.maybeEscape("char",  1)},
			{key: "Backspace",  run: (view) => this.handleBackspace() },
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
		if(!this._codeMirror) { return true; }

		// cannot escape when selection was nonempty
		let {state} = this._codeMirror;
		if(!state.selection.main.empty) { return false; }

		let mainSelection = state.selection.main;
		let range: { from: number, to: number };
		if(unit === "line") { range = state.doc.lineAt(state.selection.main.head); }
		else                { range = mainSelection; }

		// if movement does not bring cursor over edge, no escape
		if (dir < 0 ? range.from > 0 : range.to < state.doc.length) { return false; }
		
		// perform the escape
		let targetPos = this._getPos() + (dir < 0 ? 0 : this._node.nodeSize)
		let selection = PS.Selection.near(this._proseView.state.doc.resolve(targetPos), dir)
		let tr = this._proseView.state.tr.setSelection(selection).scrollIntoView();
		this._proseView.dispatch(tr)
		this._proseView.focus();

		return true;
	}

	handleBackspace(): boolean {
		if(!this._codeMirror) { return true; }

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