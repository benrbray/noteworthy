// node imports
import path from "path";

// prosemirror
import { Node as ProseNode, Mark } from "prosemirror-model";

// project imports
import NoteworthyApp from "@main/app";
import { IWorkspaceDir, IFileMeta } from "@common/fileio";
import { WorkspacePlugin } from "./plugin";

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

export class CrossRefPlugin implements WorkspacePlugin {

	plugin_name:string = "crossref_plugin";
	
	_app:NoteworthyApp;

	// plugin data
	_doc2tags: DefaultMap<string, Set<string>>;
	_tag2docs: DefaultMap<string, Set<string>>;
	_tag2defs: DefaultMap<string, Set<string>>;

	constructor(main:NoteworthyApp){
		console.log(`xref-plugin :: constructor()`);
		this._app = main;

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
		console.log("xref :: file-delete", filePath);
		this.removeWikilinks(fileHash);
	}

	handleFileCreated(fileMeta:IFileMeta, doc:ProseNode): void {
		console.log("xref :: file-create", fileMeta.path);
		this.addWikilinks(fileMeta, doc);
	}

	handleFileChanged(fileMeta:IFileMeta, doc:ProseNode): void {
		console.log("xref :: file-change", fileMeta.path);

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

	addWikilinks(fileMeta:IFileMeta, doc: ProseNode) {
		// get all tags referenced / created by this file
		let wikilinks: string[] = this.discoverWikilinks(doc);
		let definedTags: string[] = this.getTagsDefinedBy({ fileMeta, doc });
		let tags = new Set<string>(this.getTags({ fileMeta, doc }).concat(wikilinks, definedTags));

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

	getTagsDefinedBy(data: { fileMeta?:IFileMeta, doc?:ProseNode }):string[] {
		/** @todo read defined_tags from yaml metadata */
		let tags:string[] = [];

		if(data.fileMeta){
			// tags defined by path
			let fileName = path.basename(data.fileMeta.path, path.extname(data.fileMeta.path));
			tags.push(this.normalizeTag(fileName));
		}

		/** @todo (7/19/20) normalize all at once? */
		return tags;
	}

	getTags(data: { fileMeta?:IFileMeta, doc?:ProseNode }):string[] {
		/** @todo read tags from yaml metadata */
		let tags:string[] = [];

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

	discoverWikilinks(doc:ProseNode){
		let wikilinks:string[] = [];

		doc.descendants((node:ProseNode, pos:number, parent:ProseNode) => {
			if(!node.type.isText){ return true; }

			let markTypes = ["wikilink", "tag", "citation"];

			if(node.marks.find((mark:Mark) => markTypes.includes(mark.type.name))) {
				let content:string = this.normalizeTag(node.textContent);
				wikilinks.push(content);
			}
			return false;
		})

		return wikilinks;
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