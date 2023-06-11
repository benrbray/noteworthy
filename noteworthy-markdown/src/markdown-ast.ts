/**
 * Abstract syntax tree format for Markdown documents.
 *
 * Based on [MDAST](https://github.com/syntax-tree/mdast),
 * but extended with custom node types like math and citations.
 *
 * TODO: (2021-05-24) Will MDAST accept a PR that improves
 *   extensibility by adding generics to each node type?
 */

import * as Mdast from "mdast";
import * as Uni from "unist";

////////////////////////////////////////////////////////////

export type Node = Root | Content;

export type Content =
	| TopLevelContent
	| PhrasingContent
	| ListContent
	| TableContent
	| RowContent;

export type TopLevelContent =
	| BlockContent
	| FrontmatterContent
	| DefinitionContent;

export type BlockContent =
	| Paragraph
	| Heading
	| ThematicBreak
	| Blockquote
	| List
	| Table
	| Mdast.HTML
	| Mdast.Code
	| BlockMath
	| ContainerDirective
	| LeafDirective;

export type PhrasingContent =
	| StaticPhrasingContent
	| Link | LinkReference
	| InlineMath
	| TextDirective;

export type StaticPhrasingContent =
	| Text
	| Emphasis
	| Strong
	| Delete
	| Mdast.HTML
	| Mdast.InlineCode
	| Mdast.Break
	| Mdast.Image
	| Mdast.ImageReference
	| Footnote
	| Mdast.FootnoteReference
	| Wikilink
	| Cite;

export type DefinitionContent = Definition | FootnoteDefinition;

export type { Literal } from "mdast";

// -- Modified Node Types ----------------------------------

export interface Parent extends Uni.Parent {
	children: Content[];
}

export interface Root extends Parent {
	type: "root";
}

export interface Paragraph extends Parent {
	type: 'paragraph';
	children: PhrasingContent[];
}

export interface Heading extends Parent {
	type: 'heading';
	depth: 1 | 2 | 3 | 4 | 5 | 6;
	children: PhrasingContent[];
}

export interface Blockquote extends Parent {
	type: 'blockquote';
	children: BlockContent[];
}
// thematic break
import { ThematicBreak } from "./remark-plugins/concrete/mdast-util-concrete";
export type { ThematicBreak } from "./remark-plugins/concrete/mdast-util-concrete";

// -- List -------------------------------------------------

// list
export interface List extends Parent {
	type: 'list';
	ordered?: boolean;
	start?: number;
	spread?: boolean;
	children: ListContent[];
}


import { ListItem } from "./remark-plugins/concrete/mdast-util-concrete";
export type { ListItem } from "./remark-plugins/concrete/mdast-util-concrete";
export type ListContent = ListItem;

// -- Directives -------------------------------------------

// defined by "remark-directive"

interface Directive extends Uni.Parent {
	name: string,
	attributes: {
		id?: string,
		class?: string
	} & { [key:string]: string };
}

export interface TextDirective extends Directive {
	type: "textDirective"
	children: [Mdast.Text]
}

export interface LeafDirective extends Directive {
	type: "leafDirective"
	children: [Mdast.Text]
}

export interface DirectiveLabel extends Paragraph {
	data: { directiveLabel: true }
	children: [Mdast.Text]
}

export interface ContainerDirective extends Directive {
	type: "containerDirective"
	children: Content[] | [DirectiveLabel, ...Content[]]
}

// -- Table ------------------------------------------------

export type TableContent = TableRow;

export type RowContent = TableCell;

export interface Table extends Parent {
	type: 'table';
	align?: Mdast.AlignType[];
	children: TableContent[];
}

export interface TableRow extends Parent {
	type: 'tableRow';
	children: RowContent[];
}

export interface TableCell extends Parent {
	type: 'tableCell';
	children: PhrasingContent[];
}

// -- Code / Markup ----------------------------------------

export type { HTML, Code } from "mdast";

// -- Definitions ------------------------------------------

export interface Definition extends Uni.Node, Mdast.Association, Mdast.Resource {
	type: 'definition';
}

// -- Text -------------------------------------------------

import { Text } from "mdast";
export type { Text, InlineCode, Break } from "mdast";

export interface Emphasis extends Parent {
	type: 'emphasis';
	children: PhrasingContent[];
}

export interface Strong extends Parent {
	type: 'strong';
	children: PhrasingContent[];
}

export interface Delete extends Parent {
	type: 'delete';
	children: PhrasingContent[];
}

// -- Links ------------------------------------------------

export type { ImageReference, Image } from "mdast";

export interface Link extends Parent, Mdast.Resource {
	type: 'link';
	children: StaticPhrasingContent[];
}

export interface LinkReference extends Parent, Mdast.Reference {
	type: 'linkReference';
	children: StaticPhrasingContent[];
}

// -- Footnotes --------------------------------------------

export type { FootnoteReference } from "mdast";

export interface FootnoteDefinition extends Parent, Mdast.Association {
	type: 'footnoteDefinition';
	children: BlockContent[];
}

export interface Footnote extends Parent {
	type: 'footnote';
	children: PhrasingContent[];
}

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
export type { InlineCiteNode as Cite } from "@benrbray/mdast-util-cite";

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

import { YAML } from "mdast";
export type { YAML } from "mdast";

export interface TOML extends Mdast.Literal { type: "toml" }
export interface JSON extends Mdast.Literal { type: "json" }

export type FrontmatterContent = YAML | TOML | JSON;
