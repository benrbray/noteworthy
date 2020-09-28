import { Node as ProsemirrorNode } from "prosemirror-model";

export class IpynbSerializer {
	constructor() {

	}

	serialize(doc:any):string {
		return JSON.stringify( doc, undefined, "\t");
	}
}

export const ipynbSerializer = new IpynbSerializer(); 