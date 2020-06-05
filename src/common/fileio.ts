import fs from "fs";

export enum FILE_IO {
	DIALOG_OPEN = "dialog-open",
	DIALOG_SAVE_AS = "dialog-save-as",
	FILE_OPEN = "file-open",
	FILE_SAVE = "file-save",
	FILE_SAVE_AS = "file-save-as",
	FILE_OPENED = "file-opened",
	FILE_SAVED = "file-saved",
	FILE_SAVED_AS = "file-saved-as"
}

export class UntitledFile {
	fileName: null;
	fileText: string;

	constructor(){
		this.fileText = "";
	}
}

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