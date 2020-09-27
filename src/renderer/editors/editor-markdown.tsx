// electron imports
import { clipboard } from "electron";

// prosemirror imports
import { EditorView as ProseEditorView, EditorView } from "prosemirror-view";
import { Schema as ProseSchema, MarkType, Mark, Slice } from "prosemirror-model";
import { baseKeymap, toggleMark, chainCommands } from "prosemirror-commands";
import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin, EditorState } from "prosemirror-state";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { gapCursor } from "prosemirror-gapcursor";

// project imports
import { IPossiblyUntitledFile } from "@common/fileio";
import { Editor } from "./editor";

// markdown
import { markdownSchema, markdownSerializer } from "@common/markdown";
import { buildInputRules_markdown, buildKeymap_markdown } from "@common/pm-schema";

// solidjs
import { render } from "solid-js/dom";
import { createEffect, createSignal, For } from "solid-js";

// views
import { mathInputRules } from "@common/inputrules";
import { openPrompt, TextField } from "@common/prompt/prompt";
import mathSelectPlugin from "@root/lib/prosemirror-math/src/plugins/math-select";
import { MainIpcHandlers } from "@main/MainIPC";

import { YamlEditor } from "../ui/yamlEditor";
import { SetDocAttrStep } from "@common/prosemirror/steps";
import { shallowEqual } from "@common/util/equal";
import { MarkdownDoc } from "@common/doctypes/markdown-doc";
import { mathBackspace } from "@root/lib/prosemirror-math/src/plugins/math-backspace";
import { EmbedView } from "@common/nwt/nwt-embed";
import { mathPlugin } from "@root/lib/prosemirror-math/src/math-plugin";
import { ITagSearchResult } from "@main/plugins/crossref-plugin";
import { makeSuggestionPlugin } from "@renderer/ui/suggestions";

// editor commands
import { incrHeadingLevelCmd } from "@common/prosemirror/commands/demoteHeadingCmd";
import { insertTab } from "@common/prosemirror/commands/insertTab";
import { markActive } from "@common/prosemirror/util/markActive";

////////////////////////////////////////////////////////////

// editor class
export class MarkdownEditor extends Editor<ProseEditorState> {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_keymap: ProsePlugin;
	_initialized:boolean;

	// DOM
	_editorElt: HTMLElement;
	_metaElt: HTMLElement;
	_popupElt: HTMLElement;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, mainProxy: MainIpcHandlers) {
		super(file, editorElt, mainProxy);

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._proseSchema = markdownSchema;
		this._editorElt = editorElt;

		// create metadata elt
		this._metaElt = document.createElement("div");
		this._metaElt.setAttribute("id", "meta-editor");
		this._metaElt.setAttribute("class", "meta-editor");
		this._editorElt.appendChild(this._metaElt);

		// create popup elt
		this._popupElt = document.createElement("div");
		this._popupElt.setAttribute("class", "popup");
		this._editorElt.appendChild(this._popupElt);

		/** @todo (7/26/19) clean up markdown keymap */
		this._keymap = keymap({
			"Tab": chainCommands(
				incrHeadingLevelCmd(+1, false),
				insertTab
			),
			"Shift-Tab" : chainCommands(
				incrHeadingLevelCmd(-1, false, markdownSchema.nodes.paragraph),
				( () => true )
			),
			"Backspace" : chainCommands(
				incrHeadingLevelCmd(-1, true, markdownSchema.nodes.paragraph), 
				mathBackspace
			),
			"#" : incrHeadingLevelCmd(+1, true),
			"Ctrl-s": (state, dispatch, view) => {
				this.saveCurrentFile(false);
				return true;
			},
			"Ctrl-k": (state, dispatch, view) => {
				/** @todo (9/26/20) move command to separate file */
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
						if(!view){ return; }
						toggleMark(markType, attrs)(view.state, view.dispatch)
						view.focus()
					}
				})
				return true;
			},
			"Ctrl-r": (state, dispatch, view) => {
				/** @todo (9/26/20) move command to separate file */
				let { $from, $to } = state.selection;
				let nodeType = this._proseSchema.nodes.region;

				openPrompt({
					title: "Create Region",
					fields: {
						region: new TextField({
							label: "Region Name",
							required: true
						}),
					},
					callback(attrs: { [key: string]: any; } | undefined) {
						// insert new embed node at top level
						let tr = state.tr.insert($to.after(1), nodeType.createAndFill(attrs))
						if(dispatch){ dispatch(tr); }
						if(view){ view.focus(); }
					}
				})
				return true;
			},
			"Ctrl-m": (state, dispatch, view) => {
				/** @todo (9/26/20) move command to separate file */
				let { $from, $to } = state.selection;
				let nodeType = this._proseSchema.nodes.embed;

				openPrompt({
					title: "Embed Region",
					fields: {
						fileName: new TextField({
							label: "File Name",
							required: true
						}),
						regionName: new TextField({
							label: "Region Name",
							required: true
						}),
					},
					callback(attrs: { [key: string]: any; } | undefined) {
						// insert new embed node at top level
						let tr = state.tr.insert($to.after(1), nodeType.createAndFill(attrs))
						if(dispatch){ dispatch(tr); }
						if(view){ view.focus(); }
					}
				})
				return true;
			},
			"Ctrl-e": (state, dispatch, view) => {
				/** @todo (9/26/20) move command to separate file */
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
						if(dispatch) { 
							dispatch(state.tr.setNodeMarkup($from.pos, undefined, {
								href: new_href,
								title: mark.attrs.title
							}));
						}
					}
				}

				return true;
			}
		})
	}

	// == ProseMirror Configuration ===================== //

	/**
	 * Initialize a set of plugins appropriate for this editor.
	 */
	createDefaultProseMirrorPlugins(){
		return [
			mathSelectPlugin,
			buildInputRules_markdown(this._proseSchema),
			// math
			mathPlugin,
			mathInputRules,
			// suggestions
			makeSuggestionPlugin(this),
			// note: keymap order matters!
			keymap(buildKeymap_markdown(this._proseSchema)),
			this._keymap,
			keymap(baseKeymap),
			// other
			history(),
			gapCursor()
		]
	}
	
	// == Popup ========================================= //

	/** @todo (9/27/20) move popup to separate file / plugin */

	// popup data
	_popupData?: () => { data: ITagSearchResult[] };
	_setPopupData?: (v: { data: ITagSearchResult[]; }) => { data: ITagSearchResult[]; };
	// popup index
	_popupIndex?: () => number;
	_setPopupIndex?: (v: number) => number;

	initPopup() {
		let [popupData, setPopupData] = createSignal<{ data:ITagSearchResult[] }>({ data: [] });
		let [popupIndex, setPopupIndex] = createSignal(0);
		this._popupData = popupData;
		this._setPopupData = setPopupData;
		this._popupIndex = popupIndex;
		this._setPopupIndex = setPopupIndex;
		// set contents
		const Popup = () => {
			return (<div>
				<For each={popupData().data} fallback={""}>
					{(data, idx:()=>number) => (<div class={(idx()==popupIndex())?"popup-item selected":"popup-item"} innerHTML={data.resultEmphasized} />)}
				</For>
			</div>);
		}
		render(Popup, this._popupElt);
	}


	showPopupAtCursor(query:string) {
		if(!this._proseEditorView){ return; }
		this.showPopupAt(this._proseEditorView.state.selection.to, query);
	}

	async showPopupAt(pos:number, query:string) {
		if(!this._proseEditorView){ return; }

		let suggestions:ITagSearchResult[] = await this._mainProxy.tag.fuzzyTagSearch(query);

		// get screen coords for ProseMirror pos
		let coords = this._proseEditorView.coordsAtPos(pos);

		if(this._setPopupData){
			this._setPopupData({ data: suggestions });
		}

		// get editor pos
		let rect = this._editorElt.getBoundingClientRect();
		let win = this._editorElt.ownerDocument.defaultView;
		let editorX = rect.left + (win?.pageXOffset || 0);
		let editorY = rect.top + (win?.pageYOffset || 0);

		let x = coords.left - editorX + 1;
		let y = coords.bottom - editorY;

		// show popup elt
		let popupElt = this._popupElt;
		popupElt.classList.add("visible");
		popupElt.style.left = `${x | 0}px`;
		popupElt.style.top = `${y | 0}px`;
	}

	hidePopup() {
		this._popupElt.classList.remove("visible");
	}

	cyclePopupEntries(direction:(1|-1)){
		if(!this._popupIndex || !this._setPopupIndex || !this._popupData){ return; }
		let length = this._popupData().data.length;
		this._setPopupIndex(Math.min(length-1, Math.max(0, (this._popupIndex() + direction))));
	}

	getPopupSelected():ITagSearchResult|null {
		if(!this._popupData || !this._popupIndex){ return null; }
		return this._popupData().data[this._popupIndex()];
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

	initProseEditor(){
		// enforce initialization order
		if(this._initialized){ return; }

		// create prosemirror config
		let config = {
			schema: this._proseSchema,
			plugins: this.createDefaultProseMirrorPlugins()
		}
		// create prosemirror state (from file)
		let state:ProseEditorState;
		if(this._currentFile && this._currentFile.contents){
			state = this.parseContents(this._currentFile.contents);
		} else {
			state = ProseEditorState.create(config);
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
					else if(mark = markdownSchema.marks.link.isInSet(node.marks)){
						let url:string = mark.attrs.href;
						if (url) { this._mainProxy.shell.requestExternalLinkOpen(url); }
						return true;
					}
				}
				return false;
			},
			handlePaste: (view:EditorView, event:ClipboardEvent, slice:Slice<any>) => {
				let file:File|undefined;

				/** @todo (6/22/20) make this work with the ClipboardEvent? */

				// for some reason, event.clipboardData.getData("img/png") etc.
				// do not return any data.  So we use the electron clipboard instead.
				if(clipboard.availableFormats("clipboard").find(str => str.startsWith("image"))){
					let dataUrl:string = clipboard.readImage("clipboard").toDataURL();
					
					let imgNode = markdownSchema.nodes.image.createAndFill({
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
		this._popupElt.remove();
		// de-initialize
		this._initialized = false;
	}
	// == Document Model ================================ //

	serializeContents(): string {
		if(!this._proseEditorView){ return ""; }
		return markdownSerializer.serialize(this._proseEditorView.state.doc);
	}

	parseContents(contents: string):ProseEditorState {
		let parsed:MarkdownDoc|null = MarkdownDoc.parse(contents);
		if(!parsed) { throw new Error("Parse error!"); }

		return ProseEditorState.create({
			doc: parsed.proseDoc,
			plugins: this.createDefaultProseMirrorPlugins()
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