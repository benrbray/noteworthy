// node imports
import path from "path";
import { promises as fs } from "fs";

// project imports
import { IFileDesc, IDirectory } from "@common/fileio";
import hash from "@common/util/hash";

export async function parseFile(filePath:string, parent:IDirectory|null=null):Promise<IFileDesc> {
	let file:IFileDesc = {
		parent : parent,
		dirPath : path.dirname(filePath),
		path: filePath,
		name : path.basename(filePath),
		hash : hash(filePath),
		ext : path.extname(filePath),
		contents : null,
		modTime: 0,
		creationTime: 0,
		lineFeed: "\n"
	}

	// determine modify / creation time
	try {
		let stat = await fs.lstat(filePath);
		file.modTime = stat.mtimeMs;
		file.creationTime = stat.birthtimeMs;
	} catch(err) {
		console.error("fsal-file :: error reading file", filePath, err);
		throw err;
	}

	// read file contents
	let fileContent:string = await fs.readFile(filePath, { encoding: "utf8" });
	parseFileContents(file, fileContent);

	return file;
}

export async function parseFileContents(file:IFileDesc, content:string){
	// determine line feed
	file.lineFeed = '\n';
	if (/\r\n/.test(content)) file.lineFeed = '\r\n';
	if (/\n\r/.test(content)) file.lineFeed = '\n\r';

	/** @todo detect file tags */
	/** @todo detect file id */
	/** @todo detect frontmatter (combine tags with file tags) */
}