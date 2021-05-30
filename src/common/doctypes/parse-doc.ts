// import parsers
import { MarkdownASTParser } from "./markdown-doc";
import { BibTexParser } from "./bibtex-doc";
import { IFileMeta } from "@common/files";
import { readFile } from "@common/fileio";
import { IDoc, IDocParser } from "./doctypes";

////////////////////////////////////////////////////////////////////////////////

/** TODO (2021-05-30) relocate loadAST elsewhere?  only used by workspace */
export function loadAST(file:IFileMeta):IDoc|null {
	// read file
	let contents = readFile(file.path);
	if(contents === null){ return null; }

	// select parser
	let parser:IDocParser;
	switch(file.ext){
		case ".md"  : { parser = MarkdownASTParser; } break;
		case ".txt" : { parser = MarkdownASTParser; } break;
		case ".bib" : { parser = BibTexParser;   } break;
		default     : { parser = MarkdownASTParser; } break;
	}

	// parse
	return parser.parse(contents);
}