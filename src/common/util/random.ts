import crypto from "crypto";

/** @todo (7/12/20) speed test? might be really slow */
export function randomId():string {
	let result = crypto.randomBytes(4);
	return result.readUInt32LE(0).toString()
}