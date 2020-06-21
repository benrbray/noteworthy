// node imports
import path from "path";
import { promises as fs } from "fs";
import { shell } from "electron";

// project imports
import { FileHash, IFileDesc, IDirectory, IDirEntry, IDirectoryMeta, IDirEntryMeta, IFileMeta } from "@common/fileio";
import isFile from "@common/util/is-file";
import isDir from "@common/util/is-dir";
import ignoreDir from "@common/util/ignore-dir";

// fsal imports
import * as FSALFile from "./fsal-file";
import hash from "@common/util/hash";

////////////////////////////////////////////////////////////

/**
 * Reads in a file tree recursively, returning the directory descriptor object.
 * @param currentPath The current path of the directory
 * @param cache A cache object so that the files can cache themselves
 * @param parent A parent (or null, if it's a root)
 */
export async function parseDir(dirPath:string, parent:IDirectory|null=null):Promise<IDirectory> {
	let dir:IDirectory = {
		type: "directory",
		parent: parent,
		path: dirPath,
		name: path.basename(dirPath),
		hash: hash(dirPath),
		children: [],
		modTime: 0
	}

	// retrieve directory metadata
	try {
		let stats = await fs.lstat(dir.path);
		dir.modTime = stats.ctimeMs;
	} catch (err){
		console.error(`fsal-dir :: error reading metadata for directory ${dir.path}`, err);
		throw err;
	}

	// parse directory contents recursively
	let children:string[] = await fs.readdir(dir.path);
	for(let child of children){

		/** @todo parse settings from .sptz-directory files */
		/** @todo ignore some files / directories */

		// file or directory?
		let absolutePath: string = path.join(dir.path, child);
		let pathIsDir: boolean = isDir(absolutePath) && !ignoreDir(absolutePath);
		let pathIsFile: boolean = isFile(absolutePath);

		// parse accordingly
		if(pathIsFile){
			let file:IFileDesc|null = await FSALFile.parseFile(absolutePath, dir);
			if(file) dir.children.push(file);
		} else if(pathIsDir){
			dir.children.push(await parseDir(absolutePath, dir));
		}
	}

	return dir;
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
			return FSALFile.getFileMetadata(elem)
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
				result[child.hash] = FSALFile.getFileMetadata(child);
			}
		}
	}

	return result;
}