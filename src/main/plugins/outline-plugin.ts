// node imports
import path from "path";

// prosemirror
import { Node as ProseNode, Mark } from "prosemirror-model";

// project imports
import { IWorkspaceDir, IFileMeta } from "@common/files";
import { WorkspacePlugin } from "./plugin";
import { IDoc } from "@common/doctypes/doctypes";

////////////////////////////////////////////////////////////

/**
 * Document types should implement this interface in order
 * to be recognized by the built-in cross-reference system.
 */
export interface IOutlineProvider {
	/** @todo (7/28/20) better solution? */
	IS_OUTLINE_PROVIDER:true;

	/**
	 * Compute a flattened outline for this resource.
	 * @returns An ordered list of outline entries (such as
	 *     headings or other major semantic elements)
	 */
	getOutline():IOutlineEntry[];
}

export function isOutlineProvider(resource:unknown):resource is IOutlineProvider {
	return (resource as IOutlineProvider).IS_OUTLINE_PROVIDER === true;
}

export type IOutlineEntry = {
	/** Depths define an implicit tree structure among entries, beginning with 0 at the top level. */
	depth : number,
	/** A string identifier for this entry, unique within the document. */
	uniqueId: string,
	/** A (potentially non-unique) label for this entry. */
	label : string
};

/**
 * An outline is an ordered collection of IOutlineEntry objects,
 *    whose `.depth` property defines an implicit tree structure.
 */
export type IOutline = IOutlineEntry[];

////////////////////////////////////////////////////////////

export class OutlinePlugin implements WorkspacePlugin {

	plugin_name:string = "outline_plugin";

	// plugin data
	_doc2outline: { [hash:string] : IOutline };

	constructor(){
		console.log(`outline-plugin :: constructor()`);
		this._doc2outline = { };
	}

	// == Lifecycle ===================================== //

	async init():Promise<void> {
		console.log("outline-plugin :: init()");
		this.attachEvents();
	}

	attachEvents(){}
	detachEvents(){}

	dispose():void {
		this.clear();
		this.detachEvents();
	}

	clear(): void {
		this._doc2outline = { };
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
		// remove outline information for this doc
		delete this._doc2outline[fileHash];
	}

	handleFileCreated(fileMeta:IFileMeta, doc:IDoc): void {
		if(!isOutlineProvider(doc)) { return; }

		// create outline
		this._addOutlineFor(fileMeta, doc);
	}

	handleFileChanged(fileMeta:IFileMeta, doc:IDoc): void {
		if(!isOutlineProvider(doc)) { return; }

		// re-compute outline
		this._addOutlineFor(fileMeta, doc);
	}

	// == Outline Management ============================ //

	private _addOutlineFor(fileMeta:IFileMeta, doc:IOutlineProvider): void {
		// compute outline
		let outline:IOutlineEntry[] = doc.getOutline();
		this._doc2outline[fileMeta.hash] = outline;
	}

	getOutlineForHash(hash:string): IOutline | null {
		return this._doc2outline[hash] || null;
	}

	// == Persistence =================================== //

	serialize():string {
		return JSON.stringify({
			doc2outline: this._doc2outline
		})
	}

	deserialize(serialized:string): OutlinePlugin {
		let json: any = JSON.parse(serialized);
		this._doc2outline = json.doc2outline;
		/** @todo: validate that deserialized data is actually valid */
		return this;
	}
}