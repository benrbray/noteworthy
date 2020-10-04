// node imports
import path from "path";

// prosemirror
import { Node as ProseNode } from "prosemirror-model";

// project imports
import { IWorkspaceDir, IFileMeta } from "@common/fileio";
import { WorkspacePlugin } from "./plugin";
import { IDoc } from "@common/doctypes/doctypes";

// fuzzy search
import fuzzysort from "fuzzysort";
import { DefaultMap } from "@common/util/DefaultMap";
import { EditorView, NodeView, Decoration } from "prosemirror-view";
import { PluginKey, PluginSpec, Plugin as ProsePlugin, EditorState, Transaction, TextSelection } from "prosemirror-state";
import { StepMap } from "prosemirror-transform";
import { keymap } from "prosemirror-keymap";
import { chainCommands, deleteSelection } from "prosemirror-commands";

////////////////////////////////////////////////////////////

function serializeSetMap<V>(map: Map<string, Set<V>>): { [key: string]: V[] } {
	let result: any = Object.create(null);
	for (let [key, val] of map) {
		result[key] = Array.from(val.values());
	}
	return result;
}

function deserializeSetMap<V>(serialized: { [key: string]: V[] }): DefaultMap<string, Set<V>> {
	let result = new DefaultMap<string, Set<V>>(() => new Set());
	for (let key of Object.keys(serialized)) {
		result.set(key, new Set(serialized[key]));
	}
	return result;
}

////////////////////////////////////////////////////////////

/**
 * Document types should implement this interface in order
 * to be recognized by the built-in cross-reference system.
 */
export interface ICrossRefProvider {
	/** @todo (7/28/20) better solution? */
	IS_XREF_PROVIDER:true;

	/**
	 * A list of tags mentioned by this resource.
	 * 
	 * @returns A list of (unnormalized) tag names.
	 */
	getTagsMentioned():string[];
	/**
	 * A list of tags defined by this resource.  Documents
	 * mentioning these tags will point to this resource.
	 * 
	 * @returns A list of (unnormalized) tag names.
	 */
	getTagsDefined():string[];
}

export function isXrefProvider(resource:unknown):resource is ICrossRefProvider {
	return (resource as any).IS_XREF_PROVIDER === true;
}

// search results
export interface ITagSearchResult {
	type: "tag-result",
	/** Tag name **/
	result: string,
	/** Tag name, emphasized with HTML tags (<b>, etc.) to reflect alignment with a query. */
	resultEmphasized: string
}

export interface IHashSearchResult {
	type: "hash-result",
	/** file hash **/
	hash: string
}

export interface IFileSearchResult {
	type: "file-result",
	/** file hash **/
	file: IFileMeta
}

export type SearchResult = ITagSearchResult | IHashSearchResult | IFileSearchResult;

////////////////////////////////////////////////////////////

export class CrossRefPlugin implements WorkspacePlugin {

	plugin_name:string = "crossref_plugin";

	// plugin data
	_doc2tags: DefaultMap<string, Set<string>>;
	_tag2docs: DefaultMap<string, Set<string>>;
	_tag2defs: DefaultMap<string, Set<string>>;

	constructor(){
		console.log(`xref-plugin :: constructor()`);

		// crossref lookups
		this._doc2tags = new DefaultMap(() => new Set());
		this._tag2docs = new DefaultMap(() => new Set());
		this._tag2defs = new DefaultMap(() => new Set());
	}

	// == Lifecycle ===================================== //

	async init():Promise<void> {
		console.log("crossref-plugin :: init()");
		this.attachEvents();
	}

	attachEvents(){}
	detachEvents(){}

	destroy():void {
		this.clear();
		this.detachEvents();
	}

	clear(): void {
		this._doc2tags.clear();
		this._tag2docs.clear();
		this._tag2defs.clear();
	}

	// == Tag Queries =================================== //

	getDefsForTag(tag:string):string[]{
		tag = this.normalizeTag(tag);
		return Array.from(this._tag2defs.get(tag).values());
	}

	getTagMentions(tag:string):string[]{
		tag = this.normalizeTag(tag);
		let defs = this._tag2defs.get(tag);
		let uses = this._tag2docs.get(tag);
		return Array.from(new Set([...defs, ...uses]));
	}

	// == Workspace Events ============================== //
	
	async handleWorkspaceClosed(dir: IWorkspaceDir){
		console.log("xref-plugin :: handle(workspace-closed)");
		this.clear();
	}

	async handleWorkspaceOpen(dir: IWorkspaceDir) {
		console.log("xref-plugin :: handle(workspace-open)");
		/** @todo (6/18/20) */
	}

	handleFileDeleted(filePath:string, fileHash:string): void {
		//console.log("xref :: file-delete", filePath);
		this.removeWikilinks(fileHash);
	}

	handleFileCreated(fileMeta:IFileMeta, doc:IDoc): void {
		//console.log("xref :: file-create", fileMeta.path);
		if(!isXrefProvider(doc)) { return; }

		// discover wikilinks in created file
		this.addWikilinks(fileMeta, doc);
	}

	handleFileChanged(fileMeta:IFileMeta, doc:IDoc): void {
		//console.log("xref :: file-change", fileMeta.path);
		if(!isXrefProvider(doc)) { return; }

		// remove wikilinks previously associated with this file
		this.removeWikilinks(fileMeta.hash);
		// discover wikilinks in new version of file
		this.addWikilinks(fileMeta, doc);
	}

	// == Tag Management ================================ //

	removeWikilinks(fileHash: string) {
		// remove document
		this._doc2tags.delete(fileHash);

		// remove doc hash from all tags
		for (let [tag, docs] of this._tag2docs) {
			docs.delete(fileHash);
			// remove empty tags
			if (docs.size == 0) {
				this._tag2docs.delete(tag);
			}
		}

		for (let [tag, defs] of this._tag2defs) {
			defs.delete(fileHash);
			// remove empty tags
			if (defs.size == 0) {
				this._tag2defs.delete(tag);
			}
		}
	}

	addWikilinks(fileMeta:IFileMeta, doc: ICrossRefProvider) {
		// get all tags referenced / created by this file
		let definedTags: string[] = this.getTagsDefinedBy({ fileMeta, doc });
		let mentionedTags: string[] = this.getTagsMentionedBy({ fileMeta, doc });
		let tags = new Set<string>([...definedTags, ...mentionedTags]);

		// doc --> tag
		this._doc2tags.set(fileMeta.hash, tags);

		// tag --> doc
		for (let tag of tags) {
			this._tag2docs.get(tag).add(fileMeta.hash);
		}

		// tag --> defs
		for (let tag of definedTags) {
			this._tag2defs.get(tag).add(fileMeta.hash);
		}
	}

	// == Tag Discovery ================================= //

	getTagsDefinedBy(data: { fileMeta?:IFileMeta, doc?:ICrossRefProvider }):string[] {
		let tags:string[] = [];

		// tags defined within file
		if(data.doc){
			tags = tags.concat(data.doc.getTagsDefined().map(
				tag => this.normalizeTag(tag)
			));
		}

		// tags defined by file metadat
		if(data.fileMeta){
			// tags defined by path
			let fileName = path.basename(data.fileMeta.path, path.extname(data.fileMeta.path));
			tags.push(this.normalizeTag(fileName));
		}

		/** @todo (7/19/20) normalize all at once? */
		return tags;
	}

	getTagsMentionedBy(data: { fileMeta?:IFileMeta, doc?:ICrossRefProvider }):string[] {
		/** @todo read tags from yaml metadata */
		let tags:string[] = [];

		// tags mentioned within file
		if(data.doc){
			tags = tags.concat(data.doc.getTagsMentioned().map(
				tag => this.normalizeTag(tag)
			));
		}

		// tags mentioned by metadata
		if(data.fileMeta){
			// tags defined by creation time
			let creation = data.fileMeta.creationTime;
			let date = new Date(creation);
			if(!isNaN(date.valueOf())){
				tags.push(this.normalizeDate(date));
			}
		}

		return tags;
	}

	normalizeDate(date:Date):string {
		return date.toDateString().toLowerCase();
	}

	normalizeTag(content:string):string {
		// is date?
		let date:Date = new Date(content);
		if(!isNaN(date.valueOf())){
			return this.normalizeDate(date);
		}

		// handle everything else
		return content.trim().toLowerCase().replace(/[\s-:_]/, "-");
	}

	fuzzyTagSearch(query:string): ITagSearchResult[] {
		let tags = Array.from(this._tag2docs.keys());

		// list tags matching query
		let tagResults:Fuzzysort.Results = fuzzysort.go(query, tags, {
			allowTypo: true,
			limit: 10,
			threshold: -1000
		});
		
		// combine results
		return tagResults.map((result) => {
			let hl = fuzzysort.highlight(result, "<b>", "</b>");
			return {
				type: "tag-result",
				result: result.target,
				resultEmphasized: hl || result.target
			}
		});
	}

	// == Persistence =================================== //

	serialize():string {
		return JSON.stringify({
			doc2tags: serializeSetMap(this._doc2tags),
			tag2docs: serializeSetMap(this._tag2docs),
			tag2defs: serializeSetMap(this._tag2defs)
		})
	}

	deserialize(serialized:string):CrossRefPlugin {
		let json: any = JSON.parse(serialized);
		this._doc2tags = deserializeSetMap(json.doc2tags);
		this._tag2docs = deserializeSetMap(json.tag2docs);
		this._tag2defs = deserializeSetMap(json.tag2defs);

		/** @todo: validate that deserialized data is actually valid */

		return this;
	}
}

////////////////////////////////////////////////////////////

interface ICitationPluginState {

}

interface ICitationPluginOptions {
	renderCitation: (id:string) => Promise<string>;
	handleCitationOpen: (citation_text:string) => Promise<void>;
}

/** 
 * @see https://prosemirror.net/docs/ref/#view.EditorProps.nodeViews
 */
function createCitationView(renderCitation: (id:string) => Promise<string>){
	return (node: ProseNode, view: EditorView, getPos:boolean|(()=>number)): CitationView => {
		/** @todo is this necessary?
		* Docs says that for any function proprs, the current plugin instance
		* will be bound to `this`.  However, the typings don't reflect this.
		*/
		let pluginState = citationPluginKey.getState(view.state);
		if(!pluginState){ throw new Error("no math plugin!"); }

		// set up NodeView
		let nodeView = new CitationView(
			node, view, getPos as (() => number),
			{ renderCitation }
		);

		return nodeView;
	}
}

let citationPluginKey = new PluginKey<ICitationPluginState>("noteworthy-citations");

export const citationPlugin = (options:ICitationPluginOptions): ProsePlugin<ICitationPluginState> => {
	let citationPluginSpec:PluginSpec<ICitationPluginState> = {
		key: citationPluginKey,
		state: {
			init(config, instance){
				return {
					macros: {},
					activeNodeViews: []
				};
			},
			apply(tr, value, oldState, newState){
				/** @todo (8/21/20)
				* since new state has not been fully applied yet, we don't yet have
				* information about any new NodeViews that were created by this transaction.
				* As a result, the cursor position may be wrong for any newly created node views.
				*/
				let pluginState = citationPluginKey.getState(oldState);
				return value;
			},
			/** @todo (8/21/20) implement serialization */
		},
		props: {
			handleClickOn: (view, pos, node, nodePos, event, direct) => {
				// don't expand citations when ctrl+clicking
				/** @todo (10/4/20) don't reference NodeType by string */
				if(event.ctrlKey && node.type.name == "citation") {
					options.handleCitationOpen(node.textContent);
					return true;
				}
				return false;
			},
			/** @todo (10/4/20) don't reference NodeType by string */
			nodeViews: { "citation" : createCitationView(options.renderCitation) }
		}
	};
	return new ProsePlugin(citationPluginSpec);
}

////////////////////////////////////////////////////////////

interface ICitationViewOptions {
	/** Dom element name to use for this NodeView */
	tagName?: string;
	/** Given a citation id, determines the text to display. */
	renderCitation: (id:string) => Promise<string>;
}

export class CitationView implements NodeView {

	// nodeview params
	private _node: ProseNode;
	private _outerView: EditorView;
	private _getPos: (() => number);

	// nodeview dom
	dom: HTMLElement;
	private _nodeRenderElt: HTMLElement | undefined;
	private _nodeSrcElt: HTMLElement | undefined;
	private _innerView: EditorView | undefined;

	// internal state
	cursorSide: "start" | "end";
	private _tagName: string;
	private _isEditing: boolean;
	private _onDestroy: (() => void) | undefined;
	private _renderCitation: (id:string) => Promise<string>;

	// == Lifecycle ===================================== //

	/**
	 * @param onDestroy Callback for when this NodeView is destroyed.  
	 *     This NodeView should unregister itself from the list of ICursorPosObservers.
	 * 
	 * Citation Views support the following options:
	 * @option tagName HTML tag name to use for this NodeView.  If none is provided,
	 *     will use the node name with underscores converted to hyphens.
	 */
	constructor(
		node: ProseNode, 
		view: EditorView, 
		getPos: (() => number),
		options: ICitationViewOptions,
		onDestroy?: (() => void)
	) {
		// store arguments
		this._node = node;
		this._outerView = view;
		this._getPos = getPos;
		this._onDestroy = onDestroy && onDestroy.bind(this);

		// editing state
		this.cursorSide = "start";
		this._isEditing = false;

		// options
		this._renderCitation = options.renderCitation;
		this._tagName = options.tagName || this._node.type.name.replace("_", "-");

		// create dom representation of nodeview
		this.dom = document.createElement(this._tagName);
		this.dom.classList.add("citation", "node-wysiwym");

		this._nodeRenderElt = document.createElement("span");
		this._nodeRenderElt.textContent = "";
		this._nodeRenderElt.classList.add("node-render");
		this.dom.appendChild(this._nodeRenderElt);

		this._nodeSrcElt = document.createElement("span");
		this._nodeSrcElt.classList.add("node-src");
		this.dom.appendChild(this._nodeSrcElt);

		// render initial content
		this.render();
	}

	destroy() {
		// close the inner editor without rendering
		this.closeEditor(false);

		// clean up dom elements
		if (this._nodeRenderElt) {
			this._nodeRenderElt.remove();
			delete this._nodeRenderElt;
		}
		if (this._nodeSrcElt) {
			this._nodeSrcElt.remove();
			delete this._nodeSrcElt;
		}
		delete this.dom;
	}

	/**
	 * Ensure focus on the inner editor whenever this node has focus.
	 * This helps to prevent accidental deletions of math blocks.
	 */
	ensureFocus() {
		if (this._innerView && this._outerView.hasFocus()) {
			this._innerView.focus();
		}
	}

	// == Updates ======================================= //

	update(node: ProseNode, decorations: Decoration[]) {
		if (!node.sameMarkup(this._node)) return false
		this._node = node;

		if (this._innerView) {
			let state = this._innerView.state;

			let start = node.content.findDiffStart(state.doc.content)
			if (start != null) {
				let diff = node.content.findDiffEnd(state.doc.content as any);
				if (diff) {
					let { a: endA, b: endB } = diff;
					let overlap = start - Math.min(endA, endB)
					if (overlap > 0) { endA += overlap; endB += overlap }
					this._innerView.dispatch(
						state.tr
							.replace(start, endB, node.slice(start, endA))
							.setMeta("fromOutside", true))
				}
			}
		}

		if (!this._isEditing) {
			this.render();
		}

		return true;
	}

	updateCursorPos(state: EditorState): void {
		const pos = this._getPos();
		const size = this._node.nodeSize;
		const inPmSelection =
			(state.selection.from < pos + size)
			&& (pos < state.selection.to);

		if (!inPmSelection) {
			this.cursorSide = (pos < state.selection.from) ? "end" : "start";
		}
	}

	// == Events ===================================== //

	selectNode() {
		this.dom.classList.add("pm-selected");
		if (!this._isEditing) { this.openEditor(); }
	}

	deselectNode() {
		this.dom.classList.remove("pm-selected");
		if (this._isEditing) { this.closeEditor(); }
	}

	stopEvent(event: Event): boolean {
		if(event instanceof MouseEvent && event.ctrlKey){
			return false;
		}
		return (this._innerView !== undefined)
			&& (event.target !== undefined)
			&& this._innerView.dom.contains(event.target as Node);
	}

	ignoreMutation() { return true; }

	// == Rendering ===================================== //

	render() {
		/** @todo (10/2/20) ideally this check should be unnecessary,
		  * but _nodeRenderElt is initially null -- need something like linear types?
		  */
		if (!this._nodeRenderElt) { return; }
		let renderElt = this._nodeRenderElt;

		// get tex string to render
		console.log(this._node);
		let contentRaw = this._node.content.content;
		let contentStr = "";
		if (contentRaw.length > 0 && contentRaw[0].textContent !== null) {
			contentStr = contentRaw[0].textContent.trim();
		}

		// empty math?
		if (contentStr.length < 1) {
			this.dom.classList.add("node-empty");
			// clear rendered math, since this node is in an invalid state
			while(this._nodeRenderElt.firstChild){ this._nodeRenderElt.firstChild.remove(); }
			// do not render empty math
			return;
		} else {
			this.dom.classList.remove("node-empty");
		}

		// render citation
		this.dom.setAttribute("title", contentStr);
		this._nodeRenderElt.innerText = "...";

		this._renderCitation(contentStr).then((val:string) => {
			console.log(`citation-view :: setting text ${val}`);
			renderElt.innerText = val;
			renderElt.classList.remove("render-error");
		}).catch((reason:unknown) => {
			console.error(`citation-view :: could not render`);
			console.error(reason);
			renderElt.innerText = contentStr;
			renderElt.classList.add("render-error");
		});
	}

	// == Inner Editor ================================== //

	dispatchInner(tr: Transaction) {
		if (!this._innerView) { return; }
		let { state, transactions } = this._innerView.state.applyTransaction(tr)
		this._innerView.updateState(state)

		if (!tr.getMeta("fromOutside")) {
			let outerTr = this._outerView.state.tr, offsetMap = StepMap.offset(this._getPos() + 1)
			for (let i = 0; i < transactions.length; i++) {
				let steps = transactions[i].steps
				for (let j = 0; j < steps.length; j++) {
					let mapped = steps[j].map(offsetMap);
					if (!mapped) { throw Error("step discarded!"); }
					outerTr.step(mapped)
				}
			}
			if (outerTr.docChanged) this._outerView.dispatch(outerTr)
		}
	}

	openEditor() {
		if (this._innerView) { throw Error("inner view should not exist!"); }

		// create a nested ProseMirror view
		this._innerView = new EditorView(this._nodeSrcElt, {
			state: EditorState.create({
				doc: this._node,
				plugins: [keymap({
					"Backspace": chainCommands(deleteSelection, (state, dispatch, tr_inner) => {
						// default backspace behavior for non-empty selections
						if(!state.selection.empty) { return false; }
						// default backspace behavior when math node is non-empty
						if(this._node.textContent.length > 0){ return false; }
						// otherwise, we want to delete the empty math node and focus the outer view
						this._outerView.dispatch(this._outerView.state.tr.insertText(""));
						this._outerView.focus();
						return true;
					}),
					"Ctrl-Enter": (state: EditorState, dispatch: ((tr: Transaction) => void)|undefined) => {
						let { to } = this._outerView.state.selection;
						let outerState: EditorState = this._outerView.state;

						// place cursor outside of math node
						this._outerView.dispatch(
							outerState.tr.setSelection(
								TextSelection.create(outerState.doc, to)
							)
						);

						// must return focus to the outer view,
						// otherwise no cursor will appear
						this._outerView.focus();
						return true;
					}
				})]
			}),
			dispatchTransaction: this.dispatchInner.bind(this)
		})

		// focus element
		let innerState = this._innerView.state;
		this._innerView.focus();

		// determine cursor position
		let pos: number = (this.cursorSide == "start") ? 0 : this._node.nodeSize - 2;
		this._innerView.dispatch(
			innerState.tr.setSelection(
				TextSelection.create(innerState.doc, pos)
			)
		);

		this._isEditing = true;
	}

	/**
	 * Called when the inner ProseMirror editor should close.
	 * f
	 * @param render Optionally update the rendered math after closing. (which
	 *    is generally what we want to do, since the user is done editing!)
	 */
	closeEditor(render: boolean = true) {
		if (this._innerView) {
			this._innerView.destroy();
			this._innerView = undefined;
		}

		if (render) { this.render(); }
		this._isEditing = false;
	}
}