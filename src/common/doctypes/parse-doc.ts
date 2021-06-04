// import parsers
import { MarkdownASTParser } from "./markdown-doc";
import { BibTexParser } from "./bibtex-doc";
import { IDoc, IDocParser } from "./doctypes";

////////////////////////////////////////////////////////////////////////////////

/** TODO (2021-05-30) relocate parseAST elsewhere?  only used by workspace */
export function parseAST(fileExt: string, fileContents: string):IDoc|null {
	// select parser
	let parser:IDocParser;
	switch(fileExt){
		case ".md"  : { parser = MarkdownASTParser; } break;
		case ".txt" : { parser = MarkdownASTParser; } break;
		case ".bib" : { parser = BibTexParser;   } break;
		default     : { parser = MarkdownASTParser; } break;
	}

	// parse
	return parser.parse(fileContents);
}