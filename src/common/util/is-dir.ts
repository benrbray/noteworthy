/**
 * BEGIN HEADER
 *
 * Contains:        Utility function
 * CVM-Role:        <none>
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This file contains a utility function to check a path.
 *
 * END HEADER
 */

import fs from "fs";

/**
 * Checks if a given path is a valid directory
 * @param  p The path to check
 * @return True, if p is valid and also a directory
 */
export default function isDir(p:string) {
	try {
		let s = fs.lstatSync(p);
		return s.isDirectory();
	} catch (e) {
		return false;
	}
}
