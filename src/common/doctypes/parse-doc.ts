// import parsers
import { MarkdownParser } from "./markdown-doc";
import { BibTexParser } from "./bibtex-doc";
import { IFileMeta } from "@common/files";
import { readFile } from "@common/fileio";
import { IDoc, IDocParser } from "./doctypes";

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