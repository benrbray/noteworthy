// node imports
import path from "path";
import { promises as fs } from "fs";

// project imports
import { IFileDesc, IDirectory, IFileMeta } from "@common/files";
import hash from "@common/util/hash";

export async function parseFile(filePath:string, parent:IDirectory|null=null, preserveContents:boolean=false):Promise<IFileDesc|null> {
	let file:IFileDesc = {
		type: "file",
		parent : parent,
		dirPath : path.dirname(filePath),
		path: filePath,
		name : path.basename(filePath),
		hash : hash(filePath),
		ext : path.extname(filePath),
		contents : null,
		modTime: 0,
		creationTime: 0,
		//lineFeed: "\n"
	}

	// determine modify / creation time
	try {
		let stat = await fs.lstat(filePath);
		file.modTime = stat.mtimeMs;
		file.creationTime = stat.birthtimeMs;
	} catch(err) {
		console.error("fsal-file :: file error during lstat", filePath, err);
		return null;
	}

	// read file contents
	//let fileContent:string = await fs.readFile(filePath, { encoding: "utf8" });
	//parseFileContents(file, fileContent);

	//if(preserveContents){
	//	file.contents = fileContent;
	//}

	return file;
}

export async function parseFileContents(file:IFileDesc, content:string){
	// determine line feed
	//file.lineFeed = '\n';
	//if (/\r\n/.test(content)) file.lineFeed = '\r\n';
	//if (/\n\r/.test(content)) file.lineFeed = '\n\r';

	/** @todo detect file tags */
	/** @todo detect file id */
	/** @todo detect frontmatter (combine tags with file tags) */
}

export function getFileMetadata(file:IFileDesc):IFileMeta {
	return {
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
		//'lineFeed': file.lineFeed,
		//'modified': file.modified
	}
}