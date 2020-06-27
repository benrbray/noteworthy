/**
 * BEGIN HEADER
 *
 * Contains:        Utility function
 * CVM-Role:        <none>
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This file contains a utility function to hash strings.
 *
 * END HEADER
 */

import { FileHash } from "@common/fileio"
import * as pathlib from "path";

/** @todo (6/27/20) 
 *  What about multiple strings referring to the same path?
 *      docs/file.txt vs docs/../docs/file.txt
 *      docs/file.txt vs docs\file.txt
 *  Will using path.normalize() fix most of these issues?
 */

/**
* Basic hashing function (thanks to https://stackoverflow.com/a/7616484)
* @param  str The string that should be hashed
* @return hash of the given string
*/
export default function hash(str:string):FileHash {
	str = pathlib.normalize(str);
	let hash = 0
	let i, chr

	if (str.length === 0) return hash.toString();

	for (i = 0; i < str.length; i++) {
		chr = str.charCodeAt(i)
		hash = ((hash << 5) - hash) + chr
		hash |= 0 // Convert to 32bit integer
	}
	return hash.toString();
}
