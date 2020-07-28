// noteworthy imports
import { MarkdownParser } from "./markdown-doc";
import { IFileMeta, readFile } from "@common/fileio";
import { BibTexParser } from "./bibtex-doc";

////////////////////////////////////////////////////////////

/**
 * @todo (7/26/20) These typings would benefit from support
 * for polymorphic `this` in static methods for TypeScript,
 *
 * https://stackoverflow.com/questions/59774804/how-to-define-a-generic-constructor-in-typescript-under-inheritance
 * https://github.com/microsoft/TypeScript/issues/5863
 * 
 */

export interface DocMeta {
	title?:string;
	author?:string;
	url?:string;
	date?:string;
	tags_defined?:string[];
	tags?:string[];
}

export interface IDoc {
	getMeta():DocMeta;
}

export interface IDocParser {
	parse(serialized:string):IDoc|null;
}

interface IBuilder<T extends IDoc> {
	new (...args:any[]): T;
	parse(serialized:string): T|null;
}

export class ParserFor<T extends IDoc> implements IDocParser {
	private classToCreate: IBuilder<T>;

	constructor(classToCreate: IBuilder<T>) {
		this.classToCreate = classToCreate;
	}

	parse(serialized:string): T|null {
		return this.classToCreate.parse(serialized);
	}
}

////////////////////////////////////////////////////////////

export function parseFile(file:IFileMeta, contents:string):IDoc|null {
	// use file extension to determine parser
	let parser:IDocParser;
	switch(file.ext){
		case ".md"  : { parser = MarkdownParser; } break;
		case ".txt" : { parser = MarkdownParser; } break;
		case ".bib" : { parser = BibTexParser;   } break;
		default     : { parser = MarkdownParser; } break;
	}

	// parse
	return parser.parse(contents);
}

export function loadFile(file:IFileMeta):IDoc|null {
	// read file
	let contents = readFile(file.path);
	if(contents === null){ return null; }
	// parse
	return parseFile(file, contents);
}