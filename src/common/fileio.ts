import fs from "fs";

export enum FILE_IO {
	DIALOG_OPEN = "dialog-open",
	DIALOG_SAVE_AS = "dialog-save-as",
	FOLDER_OPEN = "folder-open",
	FILE_OPEN = "file-open",
	FILE_SAVE = "file-save",
	FILE_SAVE_AS = "file-save-as",
	FILE_OPENED = "file-opened",
	FILE_SAVED = "file-saved",
	FILE_SAVED_AS = "file-saved-as"
}

// -- Directory Entry ----------------------------------- //

export interface IDirEntry {
	parent: IDirectory | null;
	path:string;
	name:string;
	hash:FileHash;
	modTime: number,
}

// -- Directory ----------------------------------------- //

export interface IDirectory extends IDirEntry {
	children: IDirEntry[];
}

export interface ISubDirectory extends IDirectory {
	parent: IDirectory;
}

// -- File ---------------------------------------------- //

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

export class UntitledFile {
	fileName: null;
	fileText: string;

	constructor(){
		this.fileText = "";
	}
}

export class FileHash extends String {} 

/////////////////// OLD

export interface INamedFile {
	fileName: string,
	fileText: string;
}

export type IFileInfo = UntitledFile | INamedFile;

export const readFile = (fileName: string): string => {
	let fileText = '';
	try {
		fileText = fs.readFileSync(fileName, 'UTF-8');
	} catch (err) {
		console.log(err);
	}
	return fileText;
};

export const saveFile = (fileName: string, fileText: string): void => {
	try {
		fs.writeFileSync(fileName, fileText, 'UTF-8');
	} catch (err) {
		console.log(err);
	}
};