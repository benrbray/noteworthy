import { IFileMeta, IFileDesc } from "@common/fileio";
import * as FSALFile from "../fsal/fsal-file";
import hash from "@common/util/hash";

export class WorkspaceMeta {

	/** @todo (6/20/20) 
	 * PROBLEM: if workspace folder is moved on disk, most workspace
	 * functionality will break and we will need to manually rerefresh
	 */
	files: { [hash: string]: IFileMeta };
	plugins: null | { [name: string]: any };
	stale: boolean = true;

	constructor(files?: { [hash: string]: IFileMeta }, plugins?: { [name: string]: any }) {
		this.files = files || {};
		this.plugins = plugins || null;
	}

	static fromJSON(json: any): WorkspaceMeta {
		let result = new WorkspaceMeta(json.files, json.plugins);
		return result;
	}

	/**
	 * Called when the given path is stale and should be updated,
	 * including after a file is created, changed, or destroyed.
	 * @returns file metadata if exists, otherwise NULL
	 */
	async updatePath(filePath: string): Promise<IFileMeta|null> {
		/** @todo (6/19/20) check if path is a directory? */
		let file: IFileDesc | null = await FSALFile.parseFile(filePath);
		if(file === null) { return null; }

		// store file info in workspace
		let fileHash:string = hash(filePath);
		let fileMeta:IFileMeta = FSALFile.getFileMetadata(file);
		this.files[fileHash] = fileMeta;
		return fileMeta;
	}

	getFileByHash(hash: string): IFileMeta | null {
		return this.files[hash] || null;
	}

	/** 
	 * Compare two flattened file lists and report any changes.
	 * (based on https://stackoverflow.com/revisions/33233053/6)
	 */
	compareFiles(filesB: { [hash: string]: IFileMeta }) {
		let filesA = this.files;
		let added: string[] = [];
		let deleted: string[] = [];
		let changed: string[] = [];
		let error: string[] = [];

		for (let hash of new Set([...Object.keys(filesA), ...Object.keys(filesB)])) {
			// handle keys in B but not A
			let a = filesA[hash];
			if (a === undefined) { added.push(hash); continue; }
			// handle keys in A but not B
			let b = filesB[hash];
			if (b === undefined) { deleted.push(hash); continue; }
			// handle keys in both
			let modA: number = a.modTime;
			let modB: number = b.modTime;
			if (modA > modB) { error.push(hash); }
			else if (modA < modB) { changed.push(hash); }
		}

		return { added, deleted, changed, error };
	}
}