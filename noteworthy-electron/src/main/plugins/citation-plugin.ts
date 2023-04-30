// project imports
import { IWorkspaceDir, IFileMeta } from "@common/files";
import { WorkspacePlugin } from "./plugin";
import { IDoc } from "@common/doctypes/doctypes";

////////////////////////////////////////////////////////////

export type Citation
	= { type: "bibtex",      data: string }
	| { 
		type: "bibtex-json",
		data: {
			type: string,
			label: string|null,
			properties: { [key: string]: string }
		}
	  };

/**
 * Document types should implement this interface in order
 * to be recognized by the built-in cross-reference system.
 */
export interface ICitationProvider {
	/** @todo (7/28/20) better solution? */
	IS_CITATION_PROVIDER:true;
	getCitation(): Citation | null;
}

export function isCitationProvider(resource:unknown):resource is ICitationProvider {
	return (resource as ICitationProvider).IS_CITATION_PROVIDER === true;
}

////////////////////////////////////////////////////////////

declare global {
	namespace Noteworthy {
		export interface Plugins {
			citation_plugin: CitationPlugin;
		}
	}
}

export class CitationPlugin implements WorkspacePlugin {

	get plugin_name() :string { return "citation_plugin"; }

	// plugin data
	_doc2cite: { [hash:string] : Citation };

	constructor(){
		console.log(`${this.plugin_name} :: constructor()`);
		this._doc2cite = { };
	}

	// == Lifecycle ===================================== //

	async init():Promise<void> {
		console.log(`${this.plugin_name} :: init()`);
		this.attachEvents();
	}

	attachEvents(){}
	detachEvents(){}

	dispose():void {
		this.clear();
		this.detachEvents();
	}

	clear(): void {
		this._doc2cite = { };
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

	handleFileDeleted(filePath: string, fileHash: string): void {
		// remove metadata information for this doc
		delete this._doc2cite[fileHash];
	}

	handleFileCreated(fileMeta: IFileMeta, doc: IDoc): void {
		if(!isCitationProvider(doc)) { return; }
		this._addCitationFor(fileMeta, doc);
	}

	handleFileChanged(fileMeta: IFileMeta, doc: IDoc): void {
		if(!isCitationProvider(doc)) { return; }
		this._addCitationFor(fileMeta, doc);
	}

	// == Outline Management ============================ //

	private _addCitationFor(fileMeta: IFileMeta, doc: ICitationProvider): void {
		// do nothing if file does not provide a citation
		const cite = doc.getCitation();
		if(cite === null) { return; }

		// if doc does not specify a citation label, use the filename
		if(cite.type === "bibtex-json" && !cite.data.label) {
			cite.data.label = fileMeta.name;
		}

		console.log("_addMetadataFor", fileMeta.hash, cite);
		this._doc2cite[fileMeta.hash] = cite;
	}

	getCitationForHash(hash: string): Citation | null {
		const result = this._doc2cite[hash];
		console.log("CitationPlugin :: ", hash, result);
		return result || null;
	}

	// == Persistence =================================== //

	serialize():string {
		return JSON.stringify({
			doc2cite: this._doc2cite
		})
	}

	deserialize(serialized:string): CitationPlugin {
		let json: any = JSON.parse(serialized);
		this._doc2cite = json.doc2cite;
		/** @todo: validate that deserialized data is actually valid */
		return this;
	}
}