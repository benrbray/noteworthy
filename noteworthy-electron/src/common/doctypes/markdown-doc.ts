// noteworthy imports
import { ICrossRefProvider } from "@main/plugins/crossref-plugin";
import { IDoc, DocMeta, AstParser } from "./doctypes";
import { IOutlineProvider, IOutlineEntry } from "@main/plugins/outline-plugin";
import { IMetadataProvider, IMetadata } from "@main/plugins/metadata-plugin";
import { EditorConfig } from "@common/extensions/editor-config";

// markdown / mdast
import * as Md from "@common/markdown/markdown-ast";

// node extensions
import {
	BlockQuoteExtension, HeadingExtension, HorizontalRuleExtension,
	ListItemExtension, OrderedListExtension, UnorderedListExtension,
	CodeBlockExtension, InlineMathExtension, BlockMathExtension,
	ImageExtension, HardBreakExtension, ParagraphExtension,
	ContainerDirectiveExtension,
	CitationExtension,
	RootExtension,
	//RegionExtension, EmbedExtension,
} from "@common/extensions/node-extensions";

// mark extensions
import {
	BoldExtension, ItalicExtension, CodeExtension, LinkExtension,
	//UnderlineExtension, DefinitionExtension, StrikethroughExtension,
	WikilinkExtension,
	//TagExtension
} from "@common/extensions/mark-extensions";

import { unistPredicate, visit, visitNodeType } from "@common/markdown/unist-utils";
import { SyntaxExtension } from "@common/extensions/extension";
import { mdastTextContent } from "@common/markdown/mdast-to-string";
import { Citation, ICitationProvider } from "@main/plugins/citation-plugin";
import { pick } from "@common/util/pick";
import { parseDate, formatDate } from "@common/util/date";

// yaml / toml 
import YAML from "yaml";


////////////////////////////////////////////////////////////

let paragraphExt: ParagraphExtension;

/**
 * Initialize a list of all the default Markdown syntax extensions.
 */
export function makeDefaultMarkdownExtensions(): SyntaxExtension[] {
	return [
		// nodes: formatting
		new RootExtension(),
		(paragraphExt = new ParagraphExtension()),
		new BlockQuoteExtension(),
		new HeadingExtension(paragraphExt),
		new HorizontalRuleExtension(),
		new CodeBlockExtension(),
		new OrderedListExtension(),
		new UnorderedListExtension(),
		new ListItemExtension(),
		new ImageExtension(),
		new HardBreakExtension(),
		// nodes: math
		new InlineMathExtension(),
		new BlockMathExtension(),
		// nodes: special
		// new RegionExtension(),
		// new EmbedExtension(),
		// nodes: directives
		// new TextDirectiveExtension(),
		// new LeafDirectiveExtension(),
		new ContainerDirectiveExtension(),
		// marks
		new BoldExtension(),
		new ItalicExtension(),
		//new DefinitionExtension(),
		new LinkExtension(),
		//new UnderlineExtension(),
		new CodeExtension(),
		//new StrikethroughExtension(),
		// plugins: crossrefs
		new WikilinkExtension(),
		//new TagExtension(),
		new CitationExtension()
	];
}

/** @todo revisit default parser -- is this the best way?
 * currently, workspaces rely on this object for all
 * behind-the-scenes parsing (e.g. when file is added/changed) */
export const defaultMarkdownConfig = new EditorConfig(
	makeDefaultMarkdownExtensions(), [], {}
);

////////////////////////////////////////////////////////////////////////////////

export class MarkdownAst implements IDoc, ICrossRefProvider, IOutlineProvider, IMetadataProvider, ICitationProvider {
	
	private readonly _yaml: { [key:string] : string|string[] };

	/**
	 * Representation of a Markdown document as an abstract syntax tree.  Workspace
	 * plugins use this format to collect document metadata whenever file changes
	 * are detected on disk.
	 *
	 * @param _root Markdown document root.  Do NOT modify it!
	 */
	constructor(private readonly _root: Md.Root){
		/** TODO (2021-05-30) YAML/TOML/JSON metadata should be extracted during parsing.
		 * At the moment, YAML is only lifted from the doc during the mdast -> prose tree
		 * transformation phase.  This function is called by workspace plugins, which work
		 * with the AST directly rather than instantiating a ProseMirror document.  So,
		 * we have to manually extract the metadata here.  
		 *
		 * We shouldn't need to parse the YAML more than once in different places.  This
		 * will also cause trouble when we want to pass TOML/JSON metadata, or extract
		 * metadata that might be interspersed throughout the document.
		 *
		 * Probably, we should do a metadata collection pass on the tree as part of parsing.
		 */
		
		// expect YAML node at start of document, otherwise return empty metadata
		if(this._root?.children?.length > 0 && this._root.children[0].type === "yaml") {
			// parse YAML
			let parsedYaml = YAML.parse(this._root.children[0].value);
			// TODO (validate YAML)
			this._yaml = parsedYaml;
		} else {
			this._yaml = {};
		}
	}

	get root(): Md.Root { return this._root; }
	
	// -- IMarkdownDoc ---------------------------------- //

	getMeta(): DocMeta {
		return this._yaml;
	}
	
	static parseAST(serialized: string) : MarkdownAst|null {
		let ast = defaultMarkdownConfig.parseAST(serialized);
		if(!ast){ return null; }
		return new MarkdownAst(ast as Md.Root);
	}

	// -- IOutlineProvider ------------------------------ //

	public IS_OUTLINE_PROVIDER:true = true;

	getOutline(): IOutlineEntry[] {
		let entries:IOutlineEntry[] = [];

		// find all headings
		visitNodeType<Md.Heading>(this._root, "heading", node => {
			// heading text content
			let headingText: string = mdastTextContent(node);

			// create outline entry
			entries.push({
				depth    : node.depth,
				label    : headingText,
				uniqueId : headingText, /** @todo sluggify, ensure uniqueness */
			});
		});

		return entries;
	}

	// -- IMetadataProvider ----------------------------- //

	public IS_METADATA_PROVIDER: true = true;
	
	getMetadata(): IMetadata {
		/** @todo (10/2/20) unify this function with getMeta() above */
		return this._yaml;
	}

	// -- ICitationProvider ----------------------------- //

	public IS_CITATION_PROVIDER: true = true;

	getCitation(): Citation | null {
		// first, look for "bibtex" yaml field
		// @todo (2022/03/04) validate bibtex? allow csl-json? detect?
		// @todo (2022/03/05) avoid cast here
		let meta = this.getMeta() as { [k:string]: string};
		let bibtexField = meta.bibtex;
		if(bibtexField) { return { type: "bibtex", data: bibtexField }; }

		// next, try to assemble doc metadata into a csl-json object
		const fields = [
			"author", "editor", "publsher",
			"address", "organization", "school", "institution",
			"title", "booktitle", "journal",
			"number", "volume", "series", "edition", "pages",
			"year", "month",
			"howpublished", "isbn"
		];

		const bibFields = pick(meta, fields);

		// TODO (2022/03/07) improve date handling
		if(meta["date"] !== undefined) {
			const dateParts = parseDate(meta["date"]);
			if(dateParts) {
				const date = formatDate(dateParts);
				bibFields["date"] = date;
			}
		}

		return {
			type: "bibtex-json",
			data: {
				type: "misc",
				label: null, // TODO
				properties: bibFields
			}
		};
	}

	// -- ICrossRefProvider ----------------------------- //

	public IS_XREF_PROVIDER:true = true;

	getTagsDefined():string[] {
		let tags:string[] = [];
		
		// tags defined by YAML metadata
		let meta = this.getMeta();
		if(meta.tags_defined){
			/** @todo (7/28/20) handle different tag list formats
			 * tags_defined: justonetag
			 * tags_defined: [properly, formatted, yaml list]
			 * tags_defined: improperly, formatted, yaml list
			 */
			// handle improperly formatted yaml list
			let defs:string | string[] = meta.tags_defined;
			if(!Array.isArray(defs)){
				defs = defs.split(/\s*,\s*/g);
			}

			tags = tags.concat(defs);
		}

		return tags;
	}

	getTagsMentioned():string[] {
		let tags:string[] = [];

		// tags mentioned by YAML metadata
		let meta = this.getMeta();
		if(meta.tags){
			/** @todo (7/28/20) handle different tag list formats
			 * tags_defined: justonetag
			 * tags_defined: [properly, formatted, yaml list]
			 * tags_defined: improperly, formatted, yaml list
			 */
			// handle improperly formatted yaml list
			let mentioned:string | string[] = meta.tags;
			if(!Array.isArray(mentioned)){
				mentioned = mentioned.split(/\s*,\s*/g);
			}

			tags = tags.concat(mentioned);
		}

		// find all wikilinks and citations
		// TODO: (2021-05-30) restore #tag syntax?
		visit(this._root, node => {
			if(unistPredicate<Md.Wikilink>(node, "wikiLink")) { 
				tags.push(node.value);
			} else if(unistPredicate<Md.Cite>(node, "cite")) {
				node.data.citeItems.forEach(item => {
					tags.push(item.key);
				});
			}
		});

		return tags;
	}
}

////////////////////////////////////////////////////////////

export const MarkdownASTParser = new AstParser(MarkdownAst);

