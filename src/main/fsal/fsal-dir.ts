// node imports
import path from "path";
import { promises as fs } from "fs";
import { shell } from "electron";

// project imports
import { FileHash, IFileDesc, IDirectory, IDirEntry } from "@common/fileio";
import isFile from "@common/util/is-file";
import isDir from "@common/util/is-dir";

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
		let pathIsDir: boolean = isDir(absolutePath);
		let pathIsFile: boolean = isFile(absolutePath);

		// parse accordingly
		if(pathIsFile){
			dir.children.push(await FSALFile.parseFile(absolutePath, dir));
		} else if(pathIsDir){
			dir.children.push(await parseDir(absolutePath, dir));
		}
	}

	return dir;
}