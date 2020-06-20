import { IFileMeta, IFileDesc } from "@common/fileio";
import * as FSALFile from "../fsal/fsal-file";
import hash from "@common/util/hash";

export class WorkspaceMeta {

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
	 * @returns TRUE if workspace contains file after update, otherwise FALSE.
	 */
	async updatePath(filePath: string): Promise<boolean> {
		/** @todo (6/19/20) check if path is a directory? */
		let file: IFileDesc | null = await FSALFile.parseFile(filePath);
		if(file === null) { return false; }

		// store file info in workspace
		let fileHash:string = hash(filePath);
		this.files[fileHash] = FSALFile.getFileMetadata(file);

		return true;
	}

	getFileFromHash(hash: string): IFileMeta | null {
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