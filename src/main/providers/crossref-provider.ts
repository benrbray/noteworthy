import App from "@main/app";
import { IWorkspaceDir, IFileMeta } from "@common/fileio";
import path from "path";
import { WorkspaceProvider } from "./provider";

import { Node as ProseNode, Mark } from "prosemirror-model";

////////////////////////////////////////////////////////////

class DefaultMap<K,V> extends Map<K,V>{

	defaultFn: (key: K) => V;

	constructor(defaultFn: (key: K) => V, iterable?: Iterable<readonly [K, V]>) {
		// map constructor
		if(iterable) { super(iterable); } else { super(); }
		// default
		this.defaultFn = defaultFn;
	}

	get(key:K):V {
		let val:V|undefined = super.get(key);
		if(val === undefined){
			val = this.defaultFn(key);
			super.set(key, val);
		}
		return val;
	}

}

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

export class CrossRefProvider implements WorkspaceProvider {

	provider_name:string = "crossref_plugin";
	
	_app:App;

	// provider data
	_doc2tags: DefaultMap<string, Set<string>>;
	_tag2docs: DefaultMap<string, Set<string>>;
	_tag2defs: DefaultMap<string, Set<string>>;

	constructor(main:App){
		console.log(`xref-provider :: constructor()`);
		this._app = main;

		// crossref lookups
		this._doc2tags = new DefaultMap(() => new Set());
		this._tag2docs = new DefaultMap(() => new Set());
		this._tag2defs = new DefaultMap(() => new Set());
	}

	// == Lifecycle ===================================== //

	async init():Promise<void> {
		console.log("crossref-provider :: init()");

		this.attachEvents();

		console.log("waiting.....................................");
		await new Promise(resolve => setTimeout(resolve, 10000));
		console.log("done waiting!!!!")
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

	// == Workspace Events ============================== //
	
	async handleWorkspaceClosed(dir: IWorkspaceDir){
		console.log("xref-provider :: handle(workspace-closed)");
		this.clear();
	}

	async handleWorkspaceOpen(dir: IWorkspaceDir) {
		console.log("xref-provider :: handle(workspace-open)");
		/** @todo (6/18/20) */
	}

	handleFileDeleted(filePath: string, fileHash: string): void {
		console.log("xref :: file-delete", filePath);
		this.removeWikilinks(fileHash);
	}

	handleFileCreated(filePath: string, fileHash: string, doc:ProseNode): void {
		console.log("xref :: file-create", filePath);
		this.addWikilinks(filePath, fileHash, doc);
	}

	handleFileChanged(filePath: string, fileHash: string, doc:ProseNode): void {
		console.log("xref :: file-change", filePath);

		// remove wikilinks previously associated with this file
		this.removeWikilinks(fileHash);
		// discover wikilinks in new version of file
		this.addWikilinks(filePath, fileHash, doc);
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

	addWikilinks(filePath: string, fileHash: string, doc: ProseNode) {
		// get all tags referenced / created by this file
		let wikilinks: string[] = this.discoverWikilinks(doc);
		let definedTags: string[] = this.getTagsDefinedBy(filePath, doc);
		let tags = new Set<string>(this.getTags(doc).concat(wikilinks, definedTags));

		// doc --> tag
		this._doc2tags.set(fileHash, tags);

		// tag --> doc
		for (let tag of tags) {
			this._tag2docs.get(tag).add(fileHash);
		}

		// tag --> defs
		for (let tag of definedTags) {
			this._tag2defs.get(tag).add(fileHash);
		}
	}

	// == Tag Discovery ================================= //

	getTagsDefinedBy(filePath:string, doc:ProseNode):string[] {
		/** @todo read defined_tags from yaml metadata */
		let ext = path.extname(filePath);
		return [this.normalizeWikilink(path.basename(filePath, ext))];
	}

	getTags(doc:ProseNode):string[] {
		/** @todo read tags from yaml metadata */
		/** @todo create tag for file creationTime */
		return [];
	}

	discoverWikilinks(doc:ProseNode){
		let wikilinks:string[] = [];

		doc.descendants((node:ProseNode, pos:number, parent:ProseNode) => {
			if(!node.type.isText){ return true; }

			if(node.marks.find((mark:Mark) => mark.type.name == "wikilink")) {
				let content:string = this.normalizeWikilink(node.textContent);
				wikilinks.push(content);
			}
			return false;
		})

		return wikilinks;
	}

	normalizeWikilink(content:string):string {
		return content.trim().toLowerCase().replace(/[\s]/, "_");
	}

	// == Persistence =================================== //

	serialize():string {
		return JSON.stringify({
			doc2tags: serializeSetMap(this._doc2tags),
			tag2docs: serializeSetMap(this._tag2docs),
			tag2defs: serializeSetMap(this._tag2defs)
		})
	}

	deserialize(serialized:string):CrossRefProvider {
		let json: any = JSON.parse(serialized);
		this._doc2tags = deserializeSetMap(json.doc2tags);
		this._tag2docs = deserializeSetMap(json.tag2docs);
		this._tag2defs = deserializeSetMap(json.tag2defs);

		/** @todo: validate that deserialized data is actually valid */

		return this;
	}
}