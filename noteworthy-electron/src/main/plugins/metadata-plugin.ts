// project imports
import { IWorkspaceDir, IFileMeta } from "@common/files";
import { WorkspacePlugin } from "./plugin";
import { IDoc } from "@common/doctypes/doctypes";

////////////////////////////////////////////////////////////

/**
 * @todo (7/28/20) properly validate YAML metadata
 */
export interface MetadataFields {
	title?:string;
	author?:string;
	authors?:string; // TODO (2022/03/06) author vs authors?
	url?:string;
	date?:string;
	year?:string;
	tags_defined?:string;  // TODO (2022/03/06) yaml might give us a string[] instead
	tags?:string; // TODO (2022/03/06) yaml might give us a string[] instead
	bibtex?:string;
}

/**
 * Type representing file metadata.
 */
export type IMetadata = MetadataFields & { [key:string] : string|string[] };

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
		console.log(`metadata-plugin :: constructor()`);
		this._doc2meta = { };
	}

	// == Lifecycle ===================================== //

	async init():Promise<void> {
		console.log("metadata-plugin :: init()");
		this.attachEvents();
	}

	attachEvents(){}
	detachEvents(){}

	dispose():void {
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
		// remove metadata information for this doc
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
