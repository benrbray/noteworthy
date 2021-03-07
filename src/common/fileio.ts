import fs from "fs";

////////////////////////////////////////////////////////////

export function readFile(filePath: string): string | null {
	let fileText = null;
	try {
		fileText = fs.readFileSync(filePath, { encoding: "utf8" });
	} catch (err) {
		console.log(err);
	}
	return fileText;
}

export function saveFile(filePath: string, fileText: string): void {
	console.log("saveFile ::", filePath, fileText);
	try {
		fs.writeFileSync(filePath, fileText, 'UTF-8');
	} catch (err) {
		console.log(err);
	}
}
