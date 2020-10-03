// project imports
import { IWorkspaceDir, IFileMeta } from "@common/fileio";
import { WorkspacePlugin } from "./plugin";
import { IDoc } from "@common/doctypes/doctypes";

////////////////////////////////////////////////////////////

/**
 * An outline is an ordered collection of IOutlineEntry objects,
 *    whose `.depth` property defines an implicit tree structure.
 */
export type IMetadata = { [key:string] : string|string[] };

/**
 * Document types should implement this interface in order
 * to be recognized by the built-in cross-reference system.
 */
export interface IMetadataProvider {
	/** @todo (7/28/20) better solution? */
	IS_METADATA_PROVIDER:true;
	getMetadata():IMetadata;
}

export function isMetadataProvider(resource:unknown):resource is IMetadataProvider {
	return (resource as IMetadataProvider).IS_METADATA_PROVIDER === true;
}

////////////////////////////////////////////////////////////

export class MetadataPlugin implements WorkspacePlugin {

	plugin_name:string = "metadata_plugin";

	// plugin data
	_doc2meta: { [hash:string] : IMetadata };

	constructor(){
		console.log(`outline-plugin :: constructor()`);
		this._doc2meta = { };
	}

	// == Lifecycle ===================================== //

	async init():Promise<void> {
		console.log("outline-plugin :: init()");
		this.attachEvents();
	}

	attachEvents(){}
	detachEvents(){}

	destroy():void {
		this.clear();
		this.detachEvents();
	}

	clear(): void {
		this._doc2meta = { };
	}

	// == Workspace Events ============================== //
	
	async handleWorkspaceClosed(dir: IWorkspaceDir){
		console.log(`${this.plugin_name} :: handle(workspace-closed)`);
		this.clear();
	}

	async handleWorkspaceOpen(dir: IWorkspaceDir) {
		console.log(`${this.plugin_name} :: handle(workspace-open)`);
		/** @todo (6/18/20) */
	}

	handleFileDeleted(filePath:string, fileHash:string): void {
		// remove outline information for this doc
		delete this._doc2meta[fileHash];
	}

	handleFileCreated(fileMeta:IFileMeta, doc:IDoc): void {
		if(!isMetadataProvider(doc)) { return; }
		this._addMetadataFor(fileMeta, doc);
	}

	handleFileChanged(fileMeta:IFileMeta, doc:IDoc): void {
		if(!isMetadataProvider(doc)) { return; }
		this._addMetadataFor(fileMeta, doc);
	}

	// == Outline Management ============================ //

	private _addMetadataFor(fileMeta:IFileMeta, doc:IMetadataProvider): void {
		this._doc2meta[fileMeta.hash] = doc.getMetadata();
	}

	getMetadataForHash(hash:string): IMetadata | null {
		return this._doc2meta[hash] || null;
	}

	// == Persistence =================================== //

	serialize():string {
		return JSON.stringify({
			doc2meta: this._doc2meta
		})
	}

	deserialize(serialized:string): MetadataPlugin {
		let json: any = JSON.parse(serialized);
		this._doc2meta = json.doc2meta;
		/** @todo: validate that deserialized data is actually valid */
		return this;
	}
}