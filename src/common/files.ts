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

////////////////////////////////////////////////////////////

/**
 * Re-interpret an IFileDesc object as an IFileMeta object.
 * TODO (2021-05-30) IFileDesc/IFileMeta should be composed together, rather than discriminated
 */
export function getFileMetadata(file: IFileDesc): IFileMeta {
	return {
		// TODO: (the below reasoning was copied from Notable -- is it applicable to Noteworthy?)
		// By only passing the hash, the object becomes
		// both lean AND it can be reconstructed into a
		// circular structure with NO overheads in the
		// renderer.
		'parentHash': (file.parent) ? file.parent.hash : null,
		'dirPath': file.dirPath,
		'path': file.path,
		'name': file.name,
		'hash': file.hash,
		'ext': file.ext,
		'type': file.type,
		'modTime': file.modTime,
		'creationTime': file.creationTime,
	};
}

/**
 * This function returns a sanitized, non-circular version of dirObject.
 * @param dir A directory descriptor
 */
export function getDirMetadata(dir:IDirectory):IDirectoryMeta {
	// Handle the children
	let children:IDirEntryMeta[] = dir.children.map((elem:IDirEntry) => {
		if (elem.type === 'directory') {
			return getDirMetadata(elem)
		} else {
			return getFileMetadata(elem)
		}
	})

	return {
		// By only passing the hash, the object becomes
		// both lean AND it can be reconstructed into a
		// circular structure with NO overheads in the
		// renderer.
		"type": "directory",
		'parentHash': (dir.parent) ? dir.parent.hash : null,
		'path': dir.path,
		'name': dir.name,
		'hash': dir.hash,
		'childrenMeta': children,
		'modTime': dir.modTime
	}
}

/**
 * Returns a flattened list of all the files in the given directory object.
 */
export function getFlattenedFiles(dir:IDirectory): { [hash:string] : IFileMeta } {
	let queue:IDirectory[] = [dir];
	let result: { [hash: string]: IFileMeta } = Object.create(null);

	while(queue.length > 0){
		let dir = queue.pop();
		if(!dir) break;

		for (let child of dir.children) {
			if (child.type == "directory") {
				queue.push(child);
			} else {
				result[child.hash] = getFileMetadata(child);
			}
		}
	}

	return result;
}