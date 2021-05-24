import * as Mdast from "mdast";

////////////////////////////////////////////////////////////

export type Node = Mdast.Root | Content

export type Content =
	| TopLevelContent
	| Mdast.ListContent
	| Mdast.TableContent
	| Mdast.RowContent
	| Mdast.PhrasingContent;

export type TopLevelContent =
	| BlockContent
	| FrontmatterContent
	| Mdast.DefinitionContent;

export type BlockContent =
	| Mdast.BlockContent
	| BlockMath

export type PhrasingContent = StaticPhrasingContent
	| Mdast.Link | Mdast.LinkReference
	| InlineMath;

export type StaticPhrasingContent =
	Mdast.StaticPhrasingContent
	| Wikilink
	| Cite

export {
	DefinitionContent, ListContent,
	TableContent, RowContent,
	Parent, Literal
} from "mdast";

// blocks
export {
	Root, Paragraph, Heading, Blockquote,
	Table, TableRow, TableCell,
	HTML, Code, Definition,
	Text, Emphasis, Strong, Delete, InlineCode, Break,
	Link, Image, LinkReference, ImageReference,
	Footnote, FootnoteDefinition, FootnoteReference,
} from "mdast";

// -- Modified Node Types ----------------------------------

// thematic break
export { ThematicBreak } from "./remark-plugins/concrete/mdast-util-concrete";

// list
export { List } from "mdast";
export { ListItem } from "./remark-plugins/concrete/mdast-util-concrete";

// -- Wikilink ---------------------------------------------

/** Wikilink node from [`mdast-util-wikilink`](https://github.com/landakram/mdast-util-wiki-link). */
export interface Wikilink extends Mdast.Literal {
	type: "wikiLink",
	/** [[Real Page:Page Alias]] -> "Real Page" */
	value: string,
	data: {
		/** [[Real Page:Page Alias]] -> "Page Alias" */
		alias: string,
		/** [[Real Page:Page Alias]] -> "real_page" (sluggified) */
		permalink: string,
		/** Whether the wikilink exists in the provided wikilink database. */
		exists: boolean
	}
}

// -- Citation ---------------------------------------------

import { InlineCiteNode as Cite } from "@benrbray/mdast-util-cite";
export { InlineCiteNode as Cite } from "@benrbray/mdast-util-cite";

// -- Math -------------------------------------------------

/** Inline math node from [`mdast-util-math`](https://github.com/syntax-tree/mdast-util-math/blob/main/from-markdown.js#L60). */
export interface BlockMath extends Mdast.Literal {
	type: "math"
}

/** Block math node from [`mdast-util-math`](https://github.com/syntax-tree/mdast-util-math/blob/main/from-markdown.js#L20). */
export interface InlineMath extends Mdast.Literal {
	type: "inlineMath"
}

export type Math = BlockMath | InlineMath;

// -- remark-frontmatter -----------------------------------

export { YAML } from "mdast";
export interface TOML extends Mdast.Literal { type: "toml" }
export interface JSON extends Mdast.Literal { type: "json" }

export type FrontmatterContent = Mdast.FrontmatterContent | TOML | JSON;
