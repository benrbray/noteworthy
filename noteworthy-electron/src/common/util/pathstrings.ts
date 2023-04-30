export function replaceInvalidFileNameChars(fileName:string){
	console.log("before", fileName);
	let after = fileName.trim()
	.replace(/[:\/\\<>\?\*"']/g, "_")
	.replace(/\s/g, " ");
	console.log("after", after);
	return after;
}