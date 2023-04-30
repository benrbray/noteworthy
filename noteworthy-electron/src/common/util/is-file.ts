/**
 * BEGIN HEADER
 *
 * Contains:        Utility function
 * CVM-Role:        <none>
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This file contains a utility function to check a file.
 *
 * END HEADER
 */

import fs from "fs";

/**
 * Checks if a given path is a valid file
 * @param  p The path to check
 * @return True, if it is a valid path + file, and false if not
 */
export default function isFile(p:string) {
	try {
		let s = fs.lstatSync(p);
		return s.isFile();
	} catch (e) {
		return false;
	}
}