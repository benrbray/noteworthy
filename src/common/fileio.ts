import fs from "fs";

// -- Directory Entry ----------------------------------- //

export type IDirEntry = IDirectory | IFileDesc;

export type IDirEntryMeta = IDirectoryMeta | IFileMeta;

// -- Directory ----------------------------------------- //

export interface IDirectory {
	type: "directory";
	// directory info
	children: IDirEntry[];
	// common
	parent: IDirectory | null;
	path: string;
	name: string;
	hash: FileHash;
	modTime: number;
}

export interface IDirectoryMeta extends Omit<IDirectory, "parent"|"children"> {
	parentHash:string|null;
	childrenMeta:IDirEntryMeta[];
}

export interface IWorkspaceDir extends IDirectory {
	workspaceDataPath:string;
}

export interface ISubDirectory extends IDirectory {
	parent: IDirectory;
}

// -- File ---------------------------------------------- //}

export interface IFileDesc {
	type: "file";
	// file info
	dirPath: string;
	ext: string;
	contents: string | null;
	creationTime: number;
	//lineFeed: "\n"|"\n\r"|"\r\n";
	// common
	parent: IDirectory | null;
	path: string;
	name: string;
	hash: FileHash;
	modTime: number;
}

export interface IFileMeta extends Omit<IFileDesc, "parent"|"contents"> {
	parentHash: string|null;
}

export interface IFileWithContents extends IFileDesc {
	contents: string;
}

export class IUntitledFile implements Omit<IFileWithContents, "ext"|"lineFeed"|"parent"|"path"|"name"|"hash"|"dirPath"> {
	type: "file" = "file";
	name?: undefined;
	path?: undefined;
	dirPath?: undefined;
	parent?: undefined;
	modTime: -1;
	creationTime: -1;
	contents: string;

	constructor(contents?:string){
		this.modTime = -1;
		this.creationTime = -1;
		this.contents = contents || "";
	}
}
export type IPossiblyUntitledFile = IFileWithContents | IUntitledFile;

export type FileHash = string; 

// -- Workspace ----------------------------------------- //

export enum FileCmp {
	DELETED       = -2,
	MODTIME_DECR  = -1,
	MODTIME_EQUAL =  0,
	MODTIME_INCR  =  1,
	ADDED         =  2
}

export interface IWorkspaceMetaJSON {

}

export class WorkspaceMeta {

	files:{ [hash:string] : IFileMeta };
	stale:boolean = true;

	constructor(files:{ [hash:string] : IFileMeta} = {}){
		this.files = files;
	}

	static fromJSON(json:any):WorkspaceMeta {
		let result = new WorkspaceMeta(json.files);
		return result;
	}

	/** 
	 * Compare two flattened file lists and report any changes.
	 * (based on https://stackoverflow.com/revisions/33233053/6)
	 */
	compareFiles(filesB:{ [hash:string] : IFileMeta }) {
		let filesA = this.files;
		let added:   string[] = [];
		let deleted: string[] = [];
		let changed: string[] = [];
		let error:   string[] = [];

		let x = filesA["hey"];
		
		for(let hash of new Set([...Object.keys(filesA), ...Object.keys(filesB)])){
			// handle keys in B but not A
			let a = filesA[hash];
			if(a === undefined){ added.push(hash); continue; }
			// handle keys in A but not B
			let b = filesB[hash];
			if (b === undefined) { deleted.push(hash); continue; }
			// handle keys in both
			let modA: number = a.modTime;
			let modB: number = b.modTime;
			if      (modA > modB) { error.push(hash); }
			else if (modA < modB) { changed.push(hash); }
		}

		return { added, deleted, changed, error };
	}
}

/////////////////// OLD

export const readFile = (filePath: string): string|null => {
	let fileText = null;
	try {
		fileText = fs.readFileSync(filePath, 'UTF-8');
	} catch (err) {
		console.log(err);
	}
	return fileText;
};

export const saveFile = (filePath: string, fileText: string): void => {
	console.log("saveFile ::", filePath, fileText);
	try {
		fs.writeFileSync(filePath, fileText, 'UTF-8');
	} catch (err) {
		console.log(err);
	}
};