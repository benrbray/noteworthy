// node imports
import pathlib from "path";

// Supported filetypes
/** @todo (6/28/20) read supported file types from config file? */
const filetypes = [".md", ".txt", ".ipynb", ".journal"]

/**
* Returns true, if a given file should be ignored.
* @param  {String} p The path to the file.
* @return {Boolean}   True or false, depending on whether the file should be ignored.
*/
export function ignoreFile(p:string) {
	let ext = pathlib.extname(p).toLowerCase()
	return (!filetypes.includes(ext))
}