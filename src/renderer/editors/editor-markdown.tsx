// electron imports
import { clipboard } from "electron";

// prosemirror imports
import { EditorView as ProseEditorView, EditorView } from "prosemirror-view";
import { Mark, Slice, Node as ProseNode } from "prosemirror-model";
import { chainCommands, Keymap, joinUp, joinDown, lift, selectParentNode } from "prosemirror-commands";
import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
import { history, undo, redo } from "prosemirror-history";
import { gapCursor } from "prosemirror-gapcursor";

// project imports
import { IPossiblyUntitledFile } from "@common/fileio";
import { Editor } from "./editor";

// markdown
import { markdownSerializer } from "@common/markdown";

// solidjs
import { render } from "solid-js/dom";
import { createEffect, createSignal } from "solid-js";

// views
import mathSelectPlugin from "@root/lib/prosemirror-math/src/plugins/math-select";
import { MainIpcHandlers } from "@main/MainIPC";

import { YamlEditor } from "../ui/yamlEditor";
import { SetDocAttrStep } from "@common/prosemirror/steps";
import { shallowEqual } from "@common/util/equal";
import { MarkdownDoc } from "@common/doctypes/markdown-doc";
import { mathBackspace } from "@root/lib/prosemirror-math/src/plugins/math-backspace";
import { EmbedView } from "@common/nwt/embed-view";
import { mathPlugin } from "@root/lib/prosemirror-math/src/math-plugin";
import { makeSuggestionPlugin, SuggestionPopup } from "@renderer/ui/suggestions";

// editor commands
import { insertTab } from "@common/prosemirror/commands/insertTab";
import { undoInputRule } from "prosemirror-inputrules";
import { EditorConfig } from "@common/extensions/editor-config";
import { ImageExtension, BlockQuoteExtension, HeadingExtension, HorizontalRuleExtension, CodeBlockExtension, OrderedListExtension, UnorderedListExtension, ListItemExtension, HardBreakExtension, InlineMathExtension, BlockMathExtension, RegionExtension, EmbedExtension, ParagraphExtension } from "@common/extensions/node-extensions";
import { BoldExtension, ItalicExtension, DefinitionExtension, LinkExtension, UnderlineExtension, CodeExtension, StrikethroughExtension, WikilinkExtension, TagExtension, CitationExtension } from "@common/extensions/mark-extensions";
import { NwtExtension } from "@common/extensions/extension";

////////////////////////////////////////////////////////////

/** @todo (9/27/20) where to put check for macos? */
const mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false

////////////////////////////////////////////////////////////

// editor class
export class MarkdownEditor extends Editor<ProseEditorState> {

	_proseEditorView: ProseEditorView | null;
	_initialized:boolean;

	_config: EditorConfig;

	/** @todo (9/27/20) used by paste event -- is this the best way?
	 * if we used a ProseMirror plugin instead,*/
	_paragraphExt: ParagraphExtension;
	_imageExt: ImageExtension;

	// DOM
	_metaElt: HTMLElement;
	
	// popup
	popup: SuggestionPopup | null;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, mainProxy: MainIpcHandlers) {
		super(file, editorElt, mainProxy);

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;

		// create metadata elt
		this._metaElt = document.createElement("div");
		this._metaElt.setAttribute("id", "meta-editor");
		this._metaElt.setAttribute("class", "meta-editor");
		this._editorElt.appendChild(this._metaElt);

		// create popup elt
		this.popup = null;

		// editor extensions
		let extensions:NwtExtension[] = [
			// nodes: formatting
			(this._paragraphExt = new ParagraphExtension()),
			new BlockQuoteExtension(),
			new HeadingExtension(this._paragraphExt),
			new HorizontalRuleExtension(),
			new CodeBlockExtension(),
			new OrderedListExtension(),
			new UnorderedListExtension(),
			new ListItemExtension(),
			(this._imageExt = new ImageExtension()),
			new HardBreakExtension(),
			// nodes: math
			new InlineMathExtension(),
			new BlockMathExtension(),
			// nodes: special
			new RegionExtension(),
			new EmbedExtension(),
			// marks
			new BoldExtension(),
			new ItalicExtension(),
			new DefinitionExtension(),
			new LinkExtension(),
			new UnderlineExtension(),
			new CodeExtension(),
			new StrikethroughExtension(),
			new WikilinkExtension(),
			new TagExtension(),
			new CitationExtension()
		];

		let plugins:ProsePlugin[] = [
			mathSelectPlugin,
			mathPlugin,
			makeSuggestionPlugin(this),
			history(),
			gapCursor()
		];

		let keymap: Keymap = {
			"Tab" : insertTab,
			"Backspace" : chainCommands(mathBackspace, undoInputRule),
			"Ctrl-s": () => {
				this.saveCurrentFile(false);
				return true;
			},
			// undo/redo
			"Mod-z": undo,
			"Shift-Mod-z": redo,
			...(!mac && { "Mod-y" : redo }),
			// selection / join
			"Alt-ArrowUp" : joinUp,
			"Alt-ArrowDown" : joinDown,
			"Mod-BracketLeft" : lift,
			"Escape" : selectParentNode
		};

		// create editor config
		this._config = new EditorConfig(
			extensions,
			plugins,
			keymap
		);
	}

	// == Lifecycle ===================================== //

	init() {
		// only initialize once
		if(this._initialized){ return; }
		// initialization order matters
		this.initProseEditor();
		this.initYamlEditor();
		this.initPopup();
		// initialized
		this._initialized = true;
	}

	initYamlEditor(){
		// enforce initialization order
		if(this._initialized)      { return; }
		if(!this._proseEditorView) { throw new Error("cannot initialize YAML editor before ProseMirror"); }

		// SolidJS: create Signal for reactivity
		let state = this._proseEditorView.state;
		let [yamlMeta, setYamlMeta] = createSignal({ data: state.doc.attrs['yamlMeta'] });

		// SolidJS: render YAML editor
		const Editor = ()=>{
			// SolidJS: respond to metadata changes
			createEffect(()=>{
				let data = yamlMeta().data;
				let proseView = this._proseEditorView;
				if(!proseView){ return; }
				
				// check for metadata changes
				/** @todo (7/26/19) should this comparison be deep or shallow? */
				if(shallowEqual(data, proseView.state.doc.attrs['yamlMeta'])){
					console.log("editor :: no metadata change detected");
					return;
				}
				
				proseView.dispatch(proseView.state.tr.step(
					new SetDocAttrStep("yamlMeta", data)
				));
			});
			// build component
			return (<YamlEditor yamlMeta={yamlMeta().data} setYamlMeta={setYamlMeta} />)
		}
		
		render(Editor, this._metaElt);
	}

	initPopup(){
		if(!this._proseEditorView) { return; }
		if(!this._editorElt)       { return; }
		this.popup = new SuggestionPopup(this._proseEditorView, this._editorElt, this._mainProxy);
	}

	initProseEditor(){
		// enforce initialization order
		if(this._initialized){ return; }

		// create prosemirror state (from file)
		let state:ProseEditorState;
		if(this._currentFile && this._currentFile.contents){
			state = this.parseContents(this._currentFile.contents);
		} else {
			state = ProseEditorState.create(this._config);
		}
		
		// create prosemirror instance
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: state,
			nodeViews: {
				"embed": (node, view, getPos) => {
					return new EmbedView(
						node, view, getPos as (() => number), this._mainProxy
					);
				},
			},
			dispatchTransaction: (tr: Transaction): void => {
				// unsaved changes?
				if(tr.docChanged){ this.handleDocChanged(); }

				let proseView:EditorView = (this._proseEditorView as EditorView);

				/** @todo (7/26/20) make sure the metadata editor is notified
				 * about any changes to the document metadata.
				 */
				if(tr.steps.find((value) => (value instanceof SetDocAttrStep))){
				
				}

				console.log("selection :: ", tr.selection.from, tr.selection.to)

				// apply transaction
				proseView.updateState(proseView.state.apply(tr));
			},
			handleClick: (view: ProseEditorView<any>, pos: number, event: MouseEvent) => {
				let node = view.state.doc.nodeAt(pos);
				if(!node){ return false; }

				// ctrl-click
				let mark:Mark|null|undefined
				if(event.ctrlKey && node.isText){
					let markTypes = ["wikilink", "citation", "tag"];
					// wikilinks, tags, citations
					if (mark = node.marks.find((mark: Mark) => markTypes.includes(mark.type.name))){
						let tag = node.text;
						let directoryHint = this._currentFile?.dirPath;
						if (tag) { this._mainProxy.tag.requestTagOpen({tag, create:true, directoryHint}); }
						return true;
					}
					// links
					//else if(mark = markdownSchema.marks.link.isInSet(node.marks)){
					/** @todo (9/27/20) don't search for mark by string -- use LinkExtension object instead */
					else if(mark = node.marks.find((mark: Mark) => mark.type.name == "link")) {
						let url:string = mark.attrs.href;
						if (url) { this._mainProxy.shell.requestExternalLinkOpen(url); }
						return true;
					}
				}
				return false;
			},
			handlePaste: (view) => {

				/** @todo (6/22/20) make this work with the ClipboardEvent? */

				// for some reason, event.clipboardData.getData("img/png") etc.
				// do not return any data.  So we use the electron clipboard instead.
				if(clipboard.availableFormats("clipboard").find(str => str.startsWith("image"))){
					let dataUrl:string = clipboard.readImage("clipboard").toDataURL();
					
					let imgNode = this._imageExt.type.createAndFill({
						src: dataUrl
					});
					
					if(imgNode){
						let { $from } = view.state.selection;
						let tr = view.state.tr.deleteSelection().insert(
							$from.pos,
							imgNode
						)
						view.dispatch(tr);
						return true;
					}

				}
				
				return false;
			}
		});
	}

	destroy(): void {
		// destroy prosemirror instance
		this._proseEditorView?.destroy();
		this._proseEditorView = null;
		// destroy meta editor
		this._metaElt.remove();
		this.popup?.dispose();
		// de-initialize
		this._initialized = false;
	}

	// == Document Model ================================ //

	serializeContents(): string {
		if(!this._proseEditorView){ return ""; }
		return markdownSerializer.serialize(this._proseEditorView.state.doc);
	}

	parseContents(contents: string):ProseEditorState {
		// NOTE: it is important to use this._config to parse, rather than using
		// MarkdownDoc.parse()!  Otherwise, there will be strange bugs!  
		// The reason is that the doc and the editor will secretly be using
		// different schema instances, but the type system has no way of catching this!
		let node: ProseNode|null = this._config.parse(contents);
		if(!node){ throw new Error("parse error!"); }
		let parsed = new MarkdownDoc(node);

		return ProseEditorState.create({
			doc: parsed.proseDoc,
			...this._config
		});
	}

	setContents(contents: ProseEditorState): void {
		if(!this._proseEditorView){
			console.warn("editor-markdown :: setContents :: no editor!");
			return;
		}

		this._proseEditorView.updateState(contents);
	}
}