// prosemirror imports
import { EditorView as ProseEditorView, EditorView } from "prosemirror-view";
import { Node as ProseNode, Mark } from "prosemirror-model";
import { Keymap, chainCommands, joinUp, joinDown, lift, selectParentNode } from "prosemirror-commands";

import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
import { history, undo, redo } from "prosemirror-history";
import { gapCursor } from "prosemirror-gapcursor";

// project imports
import { IPossiblyUntitledFile } from "@common/files";
import { Editor } from "./editor";

// views
import mathSelectPlugin from "@root/lib/prosemirror-math/src/plugins/math-select";
import { MainIpcHandlers } from "@main/MainIPC";

import { SetDocAttrStep } from "@common/prosemirror/steps";
import { MarkdownDoc } from "@common/doctypes/markdown-doc";
import { EmbedView } from "@common/nwt/embed-view";
import { mathPlugin } from "@root/lib/prosemirror-math/src/math-plugin";
import { markdownSerializer } from "@common/markdown";

// editor commands
import { insertTab } from "@common/prosemirror/commands/insertTab";
import { undoInputRule } from "prosemirror-inputrules";
import { mathBackspace } from "@root/lib/prosemirror-math/src/plugins/math-backspace";
import { NwtExtension } from "@common/extensions/extension";
import { EditorConfig } from "@common/extensions/editor-config";
import {
	BlockQuoteExtension, HeadingExtension, HorizontalRuleExtension,
	CodeBlockExtension, OrderedListExtension, UnorderedListExtension,
	ListItemExtension, ImageExtension, HardBreakExtension, InlineMathExtension,
	BlockMathExtension, RegionExtension, EmbedExtension, ParagraphExtension,
	CitationExtension
} from "@common/extensions/node-extensions";
import {
	BoldExtension, ItalicExtension, DefinitionExtension, LinkExtension,
	UnderlineExtension, CodeExtension, StrikethroughExtension,
	WikilinkExtension, TagExtension
} from "@common/extensions/mark-extensions";

////////////////////////////////////////////////////////////

/** @todo (9/27/20) where to put check for macos? */
const mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false

////////////////////////////////////////////////////////////

// editor class
export class MarkdownRegionEditor extends Editor<ProseEditorState> {

	// prosemirror
	_proseEditorView: ProseEditorView | null;

	_globalState: ProseEditorState | null;

	_config: EditorConfig;

	/** @todo (9/27/20) used by paste event -- is this the best way?
	 * if we used a ProseMirror plugin instead,*/
	_paragraphExt: ParagraphExtension;
	_imageExt: ImageExtension;

	// state
	_initialized:boolean;
	_regionName:string|null;
	_region:ProseNode|null;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, mainProxy: MainIpcHandlers, regionName:string|null) {
		super(file, editorElt, mainProxy);

		console.log("editor-embed :: region =", regionName)

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._editorElt = editorElt;

		this._globalState = null;

		// region
		this._regionName = regionName;
		this._region = null;

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
			/** @todo (9/27/20) make popup work in embedded editor */
			//makeSuggestionPlugin(this),
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
		// initialized
		this._initialized = true;
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

		// restrict editing to region?
		let regionFound: boolean = false;
		let region: ProseNode | null = null;
		let regionPos:number = -1;

		if(this._regionName){
			state.doc.descendants((node, pos:number) => {
				// search for regionName
				console.log("CHECKING", node.type.name, node.attrs);
				if(node.type.name == "region" && node.attrs["region"] === this._regionName){
					if(!regionFound){
						console.log("REGION FOUND:", node);
						region = node;
						regionFound = true;
						regionPos = pos;
					} else {
						/** @todo (8/7/20) error when more than one region found */
						throw new Error("multiple regions found with same name!");
					}
				}
				
				// regions are always top-level, so don't descend further
				return false;
			});

			if(regionFound){
				this._region = region; 
			} else {
				/** @todo (8/7/20) handle case where editor has regionName, but no region found with that name!  create the region instead, or error? */
				throw new Error("no region found with name " + this._regionName);
			}
		}

		// region state
		let regionState = ProseEditorState.create({
			...this._config,
			doc: this._region
		})

		this._globalState = state;
		
		// create prosemirror instance
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: regionState,
			nodeViews: {
				"embed": (node, view, getPos) => {
					return new EmbedView(node, view, getPos as (() => number), this._mainProxy);
				}
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

				// apply transaction to parent
				if(this._globalState){
					let regionNode = this._globalState.doc.nodeAt(regionPos);
					console.log("replacing", regionNode);
					if(regionNode){
						let tr = this._globalState.tr.replaceWith(regionPos, regionPos+regionNode.content.size, proseView.state.doc);
						this._globalState = this._globalState.apply(tr);
					} else {
						throw new Error("no regionNode!");
					}
				} else {
					throw new Error("no global state!");
				}
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
				/** @todo (2021/03/05) this was temporarily disabled while setting up contextIsolation */

				// for some reason, event.clipboardData.getData("img/png") etc.
				// do not return any data.  So we use the electron clipboard instead.
				// if(clipboard.availableFormats("clipboard").find(str => str.startsWith("image"))){
				// 	let dataUrl:string = clipboard.readImage("clipboard").toDataURL();
					
				// 	let imgNode = this._imageExt.type.createAndFill({
				// 		src: dataUrl
				// 	});
					
				// 	if(imgNode){
				// 		let { $from } = view.state.selection;
				// 		let tr = view.state.tr.deleteSelection().insert(
				// 			$from.pos,
				// 			imgNode
				// 		)
				// 		view.dispatch(tr);
				// 		return true;
				// 	}

				// }
				
				return false;
			}
		});
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
		if(!this._globalState){ throw new Error("no global state to serialize!"); }
		return markdownSerializer.serialize(this._globalState.doc);
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