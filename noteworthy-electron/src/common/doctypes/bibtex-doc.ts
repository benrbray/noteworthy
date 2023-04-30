import { IDoc, DocMeta, DocParser } from "./doctypes";

////////////////////////////////////////////////////////////

interface IBibTexDoc extends IDoc { }

export class BibTexDoc implements IBibTexDoc {
	getMeta(): DocMeta {
		return {};
	}
	
	static parse(serialized: string) : BibTexDoc {
		// TODO
		return new BibTexDoc();
	}
}

export const BibTexParser = new DocParser(BibTexDoc);