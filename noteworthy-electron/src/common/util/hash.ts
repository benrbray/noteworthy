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

import { FileHash } from "@common/files"
import * as pathlib from "path";

/** @todo (6/27/20) 
 *  What about multiple strings referring to the same path?
 *      docs/file.txt vs docs/../docs/file.txt
 *      docs/file.txt vs docs\file.txt
 *  Will using path.normalize() fix most of these issues?
 */

/**
* Basic hashing function (thanks to https://stackoverflow.com/a/52171480/1444650)
* @param  str The string that should be hashed
* @return hash of the given string
*/
export default function hash(str:string, seed:number = 0):FileHash {
	let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
	for (let i = 0, ch; i < str.length; i++) {
		ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
	h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString();
};
