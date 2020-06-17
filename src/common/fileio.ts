import fs from "fs";

// -- Directory Entry ----------------------------------- //

export interface IDirEntry {
	parent: IDirectory | null;
	path:string;
	name:string;
	hash:FileHash;
	modTime: number;
}

// -- Directory ----------------------------------------- //

export interface IDirectory extends IDirEntry {
	children: IDirEntry[];
}

export interface IWorkspaceDir extends IDirectory {
	workspaceDataPath:string;
}

export interface ISubDirectory extends IDirectory {
	parent: IDirectory;
}

// -- File ---------------------------------------------- //}

export interface IFileDesc extends IDirEntry {
	dirPath: string;
	ext: string;
	contents: string | null;
	creationTime: number;
	lineFeed: "\n"|"\n\r"|"\r\n";
}


export interface IFileWithContents extends IDirEntry {
	contents: string;
}

export class IUntitledFile implements Omit<IFileWithContents, "parent"|"path"|"name"|"hash"|"dirPath"> {
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

/////////////////// OLD

export const readFile = (filePath: string): string => {
	let fileText = '';
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