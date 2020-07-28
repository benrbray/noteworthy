import { IDoc, DocMeta, ParserFor } from "./doctypes";

////////////////////////////////////////////////////////////

interface IBibTexDoc extends IDoc { }

export class BibTexDoc implements IBibTexDoc {
	getMeta():DocMeta {
		return {};
	}
	
	static parse(serialized: string) : BibTexDoc {
		return new BibTexDoc();
	}
}

export const BibTexParser = new ParserFor(BibTexDoc);