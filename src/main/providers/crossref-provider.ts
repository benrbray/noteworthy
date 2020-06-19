import App from "@main/app";
import { FileHash, IDirectory, IWorkspaceDir, FileCmp, IFileWithContents, IFileMeta } from "@common/fileio";
import { app } from "electron";
import path from "path";
import { MainEvents, FsalEvents } from "@common/events";
import { WorkspaceProvider } from "./provider";

export class CrossRefProvider implements WorkspaceProvider {

	_app:App;

	// provider data
	_doc2tags: { [fileHash: string]: string };
	_tag2docs: { [tag: string]: string };
	
	// persistence
	_dataPath:string;

	constructor(main:App, dataPath:string){
		console.log(`xref-provider :: constructor() :: dataPath = ${dataPath}`);
		this._app = main;
		this._dataPath = dataPath;

		// crossref lookups
		this._doc2tags = Object.create(null);
		this._tag2docs = Object.create(null);
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
		this.detachEvents();
	}

	// == Events ======================================== //
	
	async handleWorkspaceClosed(dir: IWorkspaceDir){
		console.log("xref-provider :: handle(workspace-closed)");
		/** @todo (6/18/20) */
	}

	async handleWorkspaceOpen(dir: IWorkspaceDir) {
		console.log("xref-provider :: handle(workspace-open)");
		/** @todo (6/18/20) */
	}

	handleFileDeleted(file: IFileMeta): void {
		throw new Error("Method not implemented.");
		console.log("xref :: file-delete", file.name);
	}

	handleFileCreated(file: IFileMeta, contents:string): void {
		console.log("xref :: file-create", file.name);
	}

	handleFileChanged(file: IFileMeta, contents:string): void {
		console.log("xref :: file-change", file.name);
	}

	// == Persistence =================================== //

	private _loadFromDisk(){

	}

	// == Data Access =================================== //

	updatePaths(paths:string[]){
		for(let path of paths){ this.updatePath(path); }
	}

	updatePath(path:string){ }

	// == Parsing ======================================= //


}