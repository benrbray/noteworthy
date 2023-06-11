// prosemirror imports
import { Schema as ProseSchema, Node as ProseNode, NodeSpec, DOMOutputSpec } from "prosemirror-model";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list"
import {
	wrappingInputRule, textblockTypeInputRule, InputRule,
} from "prosemirror-inputrules"
import {
	setBlockType, chainCommands, exitCode
} from "prosemirror-commands"

// unist imports
import * as Uni from "unist";

// noteworthy
import { Md } from "@noteworthy/markdown";

// project imports
import { incrHeadingLevelCmd } from "@common/prosemirror/commands/demoteHeadingCmd";
import { ExtensionNodeAttrs, MdastNodeMap, MdastNodeMapType, NodeSyntaxExtension, Prose2Mdast_NodeMap, Prose2Mdast_NodeMap_Presets } from "@common/extensions/extension";
import {
	makeInlineMathInputRule, makeBlockMathInputRule,
	REGEX_INLINE_MATH_DOLLARS_ESCAPED, REGEX_BLOCK_MATH_DOLLARS
} from "@benrbray/prosemirror-math";

// yaml
import YAML from "yaml";

// patched prosemirror types
import { ProseNodeType, ProseKeymap } from "@common/types";

////////////////////////////////////////////////////////////

const mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false

//// NODE EXTENSIONS ///////////////////////////////////////

/* -- Root ---------------------------------------------- */

export class RootExtension extends NodeSyntaxExtension<Md.Root> {

	// -- ProseMirror Schema -- //

	get name() { return "doc" as const; }

	createNodeSpec() {
		// top-level prosemirror node
		return {
			content: "block+",
			// TODO (2021-05-17) how to handle global document attrs like YAML?
			// (they probably shouldn't belong to the document root,
			//  especially now that we have a Markdown AST)
			attrs: { yamlMeta: { default: {} } }
		};
	}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "root" as const };

	createMdastMap(): MdastNodeMap<Md.Root> {
		return {
			mapType: "node_custom",
			mapNode: (_node, children, _ctx, state) => {
				// use yaml
				// TODO (2021-05-17) avoid cast -- need generics for ctx, state arguments?
				let attrs = {
					yamlMeta: (state as MdParseState).yaml || {}
				}

				// create top-level document node
				let result = this.nodeType.createAndFill(attrs, children || undefined);
				return result ? [result] : [];
			}
		}
	}


	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (node: ProseNode, children: Uni.Node[]): [Md.Root] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let rootAttrs = node.attrs as ExtensionNodeAttrs<RootExtension>;

			// if root yas YAML metadata, create a YAML node
			// TODO (2021-05-17) revisit conversion of YAML nodes (should not be stored in doc attrs)
			let rootChildren: Uni.Node[];

			if(Object.keys(rootAttrs.yamlMeta).length > 0) {
				// create yaml node
				let yamlNode: Md.YAML = {
					type: "yaml", // TODO (2021-05-18) support TOML, JSON, etc.
					value: YAML.stringify(rootAttrs.yamlMeta).trim()
				};
				// prepend yaml node to document
				rootChildren = [yamlNode, ...children];
			} else {
				rootChildren = children;
			}

			// TODO (2021-05-18) root attrs?
			let rootNode: AnyChildren<Md.Root> = {
				type: this.mdastNodeType,
				children: rootChildren
			}
			// TODO (2021-05-17) validate node instead of casting
			return [rootNode as Md.Root];
		}
	}}
}

/* -- Paragraph ----------------------------------------- */

export class ParagraphExtension extends NodeSyntaxExtension<Md.Paragraph> {

	// -- ProseMirror Schema -- //

	get name() { return "paragraph" as const; }

	createNodeSpec() {
		return {
			content: "inline*",
			// TODO (2021-05-18) handle / parse / serialize paragraph class name
			attrs: { class: { default: undefined } },
			group: "block",
			parseDOM: [{ tag: "p" }],
			toDOM(node: ProseNode): DOMOutputSpec { return ["p", { ...(node.attrs.class && { class: node.attrs.class }) }, 0] }
		};
	}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "paragraph" as const };
	createMdastMap() { return MdastNodeMapType.NODE_DEFAULT }

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return Prose2Mdast_NodeMap_Presets.NODE_DEFAULT; }
}

/* -- Block Quote --------------------------------------- */

// : (ProseNodeType) → InputRule
// Given a blockquote node type, returns an input rule that turns `"> "`
// at the start of a textblock into a blockquote.
export function blockQuoteRule<S extends ProseSchema>(nodeType:ProseNodeType) {
	return wrappingInputRule(/^\s*>\s$/, nodeType)
}

export class BlockQuoteExtension extends NodeSyntaxExtension<Md.Blockquote> {

	get name() { return "blockquote" as const; }

	createNodeSpec(): NodeSpec {
		return {
			content: "block+",
			group: "block",
			parseDOM: [{ tag: "blockquote" }],
			toDOM():DOMOutputSpec { return ["blockquote", 0] }
		};
	}

	createKeymap(): ProseKeymap {
		return { "Mod->" : setBlockType(this.nodeType) }
	}

	createInputRules() { return [blockQuoteRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "blockquote" as const };
	createMdastMap() { return MdastNodeMapType.NODE_DEFAULT }

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return Prose2Mdast_NodeMap_Presets.NODE_DEFAULT; }
}

/* -- Heading ------------------------------------------- */

// : (ProseNodeType, number) → InputRule
// Given a node type and a maximum level, creates an input rule that
// turns up to that number of `#` characters followed by a space at
// the start of a textblock into a heading whose level corresponds to
// the number of `#` signs.
export function headingRule<S extends ProseSchema>(nodeType: ProseNodeType, maxLevel:number) {
	return textblockTypeInputRule(new RegExp("^(#{1," + maxLevel + "})\\s$"),
		nodeType, match => ({ level: match[1].length }))
}

export class HeadingExtension extends NodeSyntaxExtension<Md.Heading> {

	get name() { return "heading" as const; }

	/**
	 * @param _bottomType Is the NodeType that should be created when a
	 *     heading is demoted from H1 (normally, _bottomType = paragraph)
	 */
	constructor(private _bottomType: NodeSyntaxExtension<any, any>) { super(); }

	createNodeSpec() {
		return {
			attrs: { level: { default: 1 } },
			content: "text*",
			group: "block",
			defining: true,
			parseDOM: [
				{ tag: "h1", attrs: { level: 1 } },
				{ tag: "h2", attrs: { level: 2 } },
				{ tag: "h3", attrs: { level: 3 } },
				{ tag: "h4", attrs: { level: 4 } },
				{ tag: "h5", attrs: { level: 5 } },
				{ tag: "h6", attrs: { level: 6 } }
			],
			toDOM(node: ProseNode): DOMOutputSpec { return ["h" + node.attrs.level, 0] }
		};
	}

	createKeymap(): ProseKeymap {
		let keymap:ProseKeymap = {
			"Tab"       : incrHeadingLevelCmd(+1, { requireTextblockStart: false, requireEmptySelection: false }),
			"#"         : incrHeadingLevelCmd(+1, { requireTextblockStart: true,  requireEmptySelection: true  }),
			"Shift-Tab" : incrHeadingLevelCmd(-1, { requireTextblockStart: false, requireEmptySelection: false }, this._bottomType.nodeType),
			"Backspace" : incrHeadingLevelCmd(-1, { requireTextblockStart: true,  requireEmptySelection: true  }, this._bottomType.nodeType),
		};

		for(let i = 1; i <= 6; i++){
			keymap[`Shift-Mod-${i}`] = setBlockType(this.nodeType, { level : i });
		}

		return keymap;
	}

	createInputRules() { return [headingRule(this.nodeType, 6)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "heading" as const };

	createMdastMap(): MdastNodeMap<Md.Heading> {
		// define map from Md.Heading -> ProseMirror Node
		return {
			mapType: "node_custom",
			mapNode: (node: Md.Heading, children: ProseNode[]): ProseNode[] => {
				// ignore empty headings
				if(children.length < 1) { return []; }
				let result = this.nodeType.createAndFill({ level: node.depth }, children);
				return result ? [result] : [];
			}
		}
	}

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (node: ProseNode, children: Uni.Node[]): [Md.Heading] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let headingAttrs = node.attrs as ExtensionNodeAttrs<HeadingExtension>;

			// create mdast heading, without validating children
			let headingNode: AnyChildren<Md.Heading> = {
				type: this.mdastNodeType,
				children: children,
				// TODO (2021-05-17) fix this if TypeScript ever gets range types
				depth: Math.max(0, Math.min(6, headingAttrs.level)) as (1|2|3|4|5|6)
			};

			// TODO (2021-05-17) validate node instead of casting
			return [headingNode as Md.Heading];
		}
	}}
}

/* -- Horizontal Rule ----------------------------------- */

export class HorizontalRuleExtension extends NodeSyntaxExtension<Md.ThematicBreak> {

	get name() { return "horizontal_rule" as const; }

	createNodeSpec() {
		return {
			group: "block",
			attrs: {
				/** Stores the user's original hrule syntax. */
				ruleContent: { default: undefined as string|undefined }
			},
			parseDOM: [{ tag: "hr" }],
			toDOM(): DOMOutputSpec { return ["div", ["hr"]] }
		};
	}

	createKeymap(): ProseKeymap { return {
		"Mod-_" : (state, dispatch) => {
			if(dispatch) {
				dispatch(state.tr.replaceSelectionWith(this.nodeType.create()).scrollIntoView())
			}
			return true
		}
	}}

	createInputRules() { return [/** @todo (9/27/20) hrule inputRule */]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "thematicBreak" as const };
	createMdastMap(): MdastNodeMap<Md.ThematicBreak> {
		// define map from Mdast Node -> ProseMirror Node
		return {
			mapType: "node_custom",
			mapNode: (node: Md.ThematicBreak, children: ProseNode[]): ProseNode[] => {
				let result = this.nodeType.createAndFill({
					ruleContent: node.ruleContent
				});
				return result ? [result] : [];
			}
		}
	}

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		// TODO (2021-05-24) we only need a custom handler here instead of nodeMapLeaf because
		// the node has attrs -- create a new handler that takes a getAttrs param
		create: (node: ProseNode): [Md.ThematicBreak] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let ruleAttrs = node.attrs as ExtensionNodeAttrs<HorizontalRuleExtension>;

			// create mdast node
			return [{
				type: this.mdastNodeType,
				...(ruleAttrs.ruleContent ? { ruleContent : ruleAttrs.ruleContent } : {}),
			}];
		}
	}}
}

/* -- Code Block ---------------------------------------- */

// : (ProseNodeType) → InputRule
// Given a code block node type, returns an input rule that turns a
// textblock starting with three backticks into a code block.
export function codeBlockRule<S extends ProseSchema>(nodeType: ProseNodeType): InputRule {
	return textblockTypeInputRule(
		/^```([a-z0-9]+)?\s$/,
		nodeType,
		(matches: string[]): ExtensionNodeAttrs<CodeBlockExtension> =>
			({ lang: matches[1] || null })
	);
}

export class CodeBlockExtension extends NodeSyntaxExtension<Md.Code> {

	get name() { return "code_block" as const; }

	createNodeSpec() {
		return {
			content: "text*",
			group: "block",
			atom: true,           // TODO (Ben @ 2023/04/16) this is needed for the codemirror-preview extension -- can we define it inside of the ext, not here?
			code: true,
			defining: true,
			marks: "",
			attrs: { lang: { default: null as null|string } },
			parseDOM: [{
				tag: "pre",
				preserveWhitespace: ("full" as "full"),
				getAttrs: (node:string|Node) => (
					{ lang: (node as HTMLElement).getAttribute("data-lang") || null }
				)
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				return [
					"pre",
					{ ...(node.attrs.lang && { "data-lang": node.attrs.lang }) },
					["code", 0]
				]
			}
		};
	}

	createKeyMap(): ProseKeymap { return {
		"Shift-Mod-\\" : setBlockType(this.nodeType) };
	}

	createInputRules() { return [codeBlockRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "code" as const };
	createMdastMap(): MdastNodeMap<Md.Code> {
		return {
			mapType: "node_custom",
			mapNode: (node: Md.Code) => {
				// it is illegal to create an empty ProseMirror TextNode
				if(node.value.length < 1) { return []; }

				// create
				let result = this.nodeType.createAndFill(
						{ lang : node.lang === undefined ? null : node.lang },
						[this.nodeType.schema.text(node.value)]
				);
				return result ? [result] : [];
			}
		}
	}

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (node: ProseNode, children: Uni.Node[]): [Md.Code] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let codeAttrs = node.attrs as ExtensionNodeAttrs<CodeBlockExtension>;

			return [{
				type: this.mdastNodeType,
				lang: codeAttrs.lang || undefined,
				value: node.textContent
			}];
		}
	}}
}

// /* -- Ordered List -------------------------------------- */

// TODO: enabling lists requires a NodeSyntaxExtension to be able to define multiple schema nodes
// or.... maybe each NodeSyntaxExtension can also have a test() that it runs on
// each node in the AST matching its mdastNodeType property
// so for OrdereDList it would be test(node: Md.List) { return node.ordered === true; }

// : (ProseNodeType) → InputRule
// Given a list node type, returns an input rule that turns a number
// followed by a dot at the start of a textblock into an ordered list.
export function orderedListRule<S extends ProseSchema>(nodeType:ProseNodeType) {
	return wrappingInputRule(/^(\d+)\.\s$/, nodeType, match => ({ order: +match[1] }),
		(match, node) => node.childCount + node.attrs.order == +match[1])
}

export class OrderedListExtension extends NodeSyntaxExtension<Md.List> {

	get name() { return "ordered_list" as const; }

	createNodeSpec() {
		return {
			content: "list_item+",
			group: "block",
			attrs: { order: { default: 1 }, tight: { default: true } },
			parseDOM: [{
				tag: "ol", getAttrs(d:string|Node) {
					let dom: HTMLElement = d as HTMLElement;
					return {
						order: +((dom.getAttribute("start")) || 1),
						tight: dom.hasAttribute("data-tight")
					}
				}
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				return ["ol", {
					...((node.attrs.order == 1) && { start: node.attrs.order }),
					...(node.attrs.tight && { "data-tight": "true" })
				}, 0]
			}
		};
	}

	createKeymap(): ProseKeymap { return {
		"Shift-Mod-9" : wrapInList(this.nodeType)
	}}

	createInputRules() { return [orderedListRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "list" as const };
	mdastNodeTest(node: Md.List) { return node.ordered === true; };
	createMdastMap(): MdastNodeMap<Md.List> {
		// define map from Mdast Node -> ProseMirror Node
		return {
			mapType: "node_custom",
			mapNode: (node: Md.List, children: ProseNode[]): ProseNode[] => {
				let result = this.nodeType.createAndFill({
					ordered: true,
					tight: (node.spread !== true)
				}, children || undefined);
				return result ? [result] : [];
			}
		}
	}

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (node: ProseNode, children: Uni.Node[]): [Md.List] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let listAttrs = node.attrs as ExtensionNodeAttrs<OrderedListExtension>;

			// create mdast node, without validating children
			let listNode: AnyChildren<Md.List> = {
				type: this.mdastNodeType,
				children: children,
				ordered: true,
				spread: !listAttrs.tight,
				start: listAttrs.order,    // TODO (2021-05-17) verify "ol.start" attribute is correct
			};

			// TODO (2021-05-17) validate node instead of casting
			return [listNode as Md.List];
		}
	}}
}

/* -- Unordered List ------------------------------------ */

function normalizeBullet(bullet:string|undefined): string|null {
	switch(bullet){
		case "*": return null; // "\u2022";
		case "+": return "+";
		// https://en.wikipedia.org/wiki/Hyphen
		case "\u2010": return "\u002D"; /* hyphen */
		case "\u2011": return "\u002D"; /* non-breaking hyphen */
		case "\u2212": return "\u002D"; /* minus */
		case "\u002D": return "\u002D"; /* hyphen-minus */
		default: return null;
	}
}

// : (ProseNodeType) → InputRule
// Given a list node type, returns an input rule that turns a bullet
// (dash, plush, or asterisk) at the start of a textblock into a
// bullet list.
export function bulletListRule<S extends ProseSchema>(nodeType:ProseNodeType) {
	return wrappingInputRule(
		/^\s*([-+*])\s$/,
		nodeType,
		// remember bullet type
		(p: string[]) => { console.log(p); return ({ bullet: p[1] }) },
		(p1:string[], p2:ProseNode) => {
			return p1[1] == (p2.attrs.bullet || "*");
		}
	)
}

export class UnorderedListExtension extends NodeSyntaxExtension<Md.List> {

	get name() { return "bullet_list" as const; }

	createNodeSpec() {
		return {
			content: "list_item+",
			group: "block",
			attrs: { tight: { default: true }, bullet: { default: undefined } },
			parseDOM: [{
				tag: "ul",
				getAttrs: (dom:string|Node) => ({
					tight: (dom as HTMLElement).hasAttribute("data-tight")
				})
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				let bullet = normalizeBullet(node.attrs.bullet || "*");
				return ["ul", {
					...(node.attrs.tight && { "data-tight": "true" }),
					...(bullet && { "data-bullet" : bullet })
				}, 0]
			}
		};
	}

	createKeymap(): ProseKeymap { return {
		"Shift-Mod-8" : wrapInList(this.nodeType)
	}}

	createInputRules() { return [bulletListRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "list" as const };
	mdastNodeTest(node: Md.List) { return node.ordered === false; };
	createMdastMap(): MdastNodeMap<Md.List> {
		// define map from Mdast Node -> ProseMirror Node
		return {
			mapType: "node_custom",
			mapNode: (node: Md.List, children: ProseNode[]): ProseNode[] => {
				let result = this.nodeType.createAndFill({
					ordered: false,
					tight: (node.spread !== true)
				}, children || undefined);
				return result ? [result] : [];
			}
		}
	}

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (node: ProseNode, children: Uni.Node[]): [Md.List] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let listAttrs = node.attrs as ExtensionNodeAttrs<UnorderedListExtension>;
			listAttrs

			// create mdast node, without validating children
			let listNode: AnyChildren<Md.List> = {
				type: this.mdastNodeType,
				children: children,
				ordered: false,
				spread: !listAttrs.tight,
			};

			// TODO (2021-05-17) validate node instead of casting
			return [listNode as Md.List];
		}
	}}
}

/* -- List Item ----------------------------------------- */

export class ListItemExtension extends NodeSyntaxExtension<Md.ListItem> {

	get name() { return "list_item" as const; }

	createNodeSpec() {
		return {
			content: "paragraph block*",
			attrs: { class: { default: undefined }, bullet: { default: undefined } },
			defining: true,
			parseDOM: [{
				tag: "li",
				getAttrs: (dom:string|Node) => ({
					bullet: (dom as HTMLElement).dataset.bullet
				})
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				let bullet = normalizeBullet(node.attrs.bullet);
				return ["li", {
					...(node.attrs.class && { class: node.attrs.class }),
					...(bullet && { "data-bullet" : bullet })
				}, 0];
			}
		};
	}

	createKeymap(): ProseKeymap { return {
		"Enter"     : splitListItem(this.nodeType),
		"Shift-Tab" : liftListItem(this.nodeType),
		"Tab"       : sinkListItem(this.nodeType)
	}}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "listItem" as const };
	createMdastMap(): MdastNodeMap<Md.ListItem> {
		// define map from Mdast Node -> ProseMirror Node
		return {
			mapType: "node_custom",
			mapNode: (node: Md.ListItem, children: ProseNode[]): ProseNode[] => {
				let result = this.nodeType.createAndFill({
					...(node.marker && { bullet : node.marker })
				}, children || undefined);
				return result ? [result] : [];
			}
		}
	}

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (node: ProseNode, children: Uni.Node[]): [Md.ListItem] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let itemAttrs = node.attrs as ExtensionNodeAttrs<ListItemExtension>;

			// create mdast node, without validating children
			let itemNode: AnyChildren<Md.ListItem> = {
				type: this.mdastNodeType,
				children: children,
				...(itemAttrs?.bullet ? { marker: itemAttrs.bullet } : {}),
				spread: false,     // TODO (2021-05-18) is there ever a case where `listItem.spread = true`?
				//checked: false,  // TODO (2021-05-18) handle listItem.checked?
			};

			// TODO (2021-05-17) validate node instead of casting
			return [itemNode as Md.ListItem];
		}
	}}
}

/* -- Unordered List ------------------------------------ */

export class ImageExtension extends NodeSyntaxExtension<Md.Image> {

	get name() { return "image" as const; }

	createNodeSpec() {
		return {
			inline: false,
			attrs: {
				src: {},
				alt: { default: null },
				title: { default: null }
			},
			group: "block",
			draggable: true,
			parseDOM: [{
				tag: "img[src]", getAttrs(d:string|Node) {
					let dom = d as HTMLElement;
					return {
						src: dom.getAttribute("src"),
						title: dom.getAttribute("title"),
						alt: dom.getAttribute("alt")
					}
				}
			}],
			toDOM(node: ProseNode): DOMOutputSpec { return ["img", node.attrs] }
		};
	}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "image" as const };
	createMdastMap(): MdastNodeMap<Md.Image> {
		// define map from Md.Heading -> ProseMirror Node
		return {
			mapType: "node_custom",
			mapNode: (node: Md.Image, children: ProseNode[]): ProseNode[] => {
				let result = this.nodeType.createAndFill({
					src: node.url,
					alt: node.alt,
					title: node.title
				});
				console.warn("ImageExtension.mdastNodeType :: node=", node);
				console.warn("ImageExtension.mdastNodeType :: result=", result);
				return result ? [result] : [];
			}
		}
	}

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (node: ProseNode): [Md.Image] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let imageAttrs = node.attrs as { src: string, alt:string|null, title:string|null };

			// create mdast node
			return [{
				type: this.mdastNodeType,
				url: imageAttrs.src as string,
				...(imageAttrs.alt   ? { alt   : imageAttrs.alt   } : {}),
				...(imageAttrs.title ? { title : imageAttrs.title } : {}),
			}];
		}
	}}
}

/* -- Hard Break ---------------------------------------- */

export class HardBreakExtension extends NodeSyntaxExtension<Md.Break> {

	get name() { return "hard_break" as const; }

	createNodeSpec() {
		return {
			inline: true,
			group: "inline",
			selectable: false,
			parseDOM: [{ tag: "br" }],
			toDOM(): DOMOutputSpec { return ["br"] }
		};
	}

	createKeymap(){
		let cmd = chainCommands(exitCode, (state, dispatch) => {
			if(dispatch){
				dispatch(state.tr.replaceSelectionWith(this.nodeType.create()).scrollIntoView())
			}
			return true
		})

		return {
			"Mod-Enter": cmd,
			"Shift-Enter": cmd,
			...(mac && { "Ctrl-Enter" : cmd })
		}
	}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "break" as const };
	createMdastMap() { return MdastNodeMapType.NODE_EMPTY }

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return Prose2Mdast_NodeMap_Presets.NODE_EMPTY };
}

/* -- Inline Math --------------------------------------- */

export class InlineMathExtension extends NodeSyntaxExtension<Md.InlineMath> {

	get name() { return "math_inline" as const; }

	createNodeSpec() {
		return {
			group: "inline math",
			content: "text*",
			inline: true,
			atom: true,
			toDOM(): DOMOutputSpec { return ["math-inline", { class: "math-node" }, 0]; },
			parseDOM: [{
				tag: "math-inline"
			}]
		};
	}

	createInputRules() { return [makeInlineMathInputRule(REGEX_INLINE_MATH_DOLLARS_ESCAPED, this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "inlineMath" as const };
	createMdastMap() { return MdastNodeMapType.NODE_LITERAL }

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return Prose2Mdast_NodeMap_Presets.NODE_LIFT_LITERAL; }
}

/* -- Block Math --------------------------------------- */

export class BlockMathExtension extends NodeSyntaxExtension<Md.BlockMath> {

	get name() { return "math_display" as const; }

	createNodeSpec(): NodeSpec {
		return {
			group: "block math",
			content: "text*",
			atom: true,
			code: true,
			toDOM(): DOMOutputSpec { return ["math-display", { class: "math-node" }, 0]; },
			parseDOM: [{
				tag: "math-display"
			}]
		};
	}

	createInputRules() { return [makeBlockMathInputRule(REGEX_BLOCK_MATH_DOLLARS, this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "math" as const };
	createMdastMap() { return MdastNodeMapType.NODE_LITERAL }

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return Prose2Mdast_NodeMap_Presets.NODE_LIFT_LITERAL; }
}

////////////////////////////////////////////////////////////

export interface ContainerDirective_ProseAttrs {
	name: string,
	attributes: Md.ContainerDirective["attributes"]
}

function makeContainerDirectiveInputRule(nodeType: ProseNodeType){
	let pattern: RegExp = /^\\([a-zA-Z0-9]+) /ig;

	const getAttrs = (matches: string[]): ContainerDirective_ProseAttrs => {
		return { name: matches[1].trim() || "directive", attributes: { } };
	}

	// always create a new block, rather than joining with an above block
	const joinPredicate = () => false;

	return wrappingInputRule(pattern, nodeType, getAttrs, joinPredicate)
}

export class ContainerDirectiveExtension extends NodeSyntaxExtension<Md.ContainerDirective> {

	get name() { return "container_directive" as const; }

	createNodeSpec() {
		return {
			content: "block+",
			group: "block",
			defining: true,  // https://prosemirror.net/docs/ref/#model.NodeSpec.defining
			isolating: true, // https://prosemirror.net/docs/ref/#model.NodeSpec.isolating
			attrs: { name : { }, attributes : { default : {} as Md.ContainerDirective["attributes"] } },
			parseDOM: [{
				tag: "div.directive",
				getAttrs: (dom:string|Node): ContainerDirective_ProseAttrs => {
					let elt = dom as HTMLElement;

					// TODO (2021-06-14) use default directive name or parse error?
					let name = elt.dataset.name || "directive";
					let attributes: ContainerDirective_ProseAttrs["attributes"] = { };

					// attribute whitelist
					for(let attrName of ["class", "id"]) {
						let value = elt.getAttribute(attrName);
						if(value === null || value === undefined) { continue; }
						attributes[attrName] = value;
					}

					// keep all "data-*" attributes except "name",
					// which is used to store the directive label
					let dataNames = Object.keys(elt.dataset)
						.filter(name => ["name"].indexOf(name) < 0);

					for(let dataName of dataNames) {
						let value = elt.dataset[dataName];
						if(value === null || value === undefined) { continue; }
						attributes[dataName] = value;
					}

					return { name, attributes };
				}
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				let attrs = node.attrs as ContainerDirective_ProseAttrs;
				let classNames = attrs.attributes.class ? `directive ${attrs.attributes.class}` : "directive"

				// prefix custom attributes with "data-"
				let dataAttrs: { [k:string] : string } = { };

				Object.keys(attrs.attributes)
					.filter(key => ["id", "class"].indexOf(key) > 0)
					.forEach(key => {
						dataAttrs[`data-${key}`] = attrs.attributes[key];
					});

				return ["div", {
					"data-name" : attrs.name,
					// TODO (2021-06-12) is this safe? decide on format for directive id
					...(attrs.attributes.id && { id : `${attrs.name}-${attrs.attributes.id}` }),
					class : classNames
				}, 0];
			}
		};
	}

	createInputRules() { return [makeContainerDirectiveInputRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "containerDirective" as const };

	//mdastNodeTest(node: Md.List) { return node.ordered === false; };

	createMdastMap(): MdastNodeMap<Md.ContainerDirective> {
		// define map from Mdast Node -> ProseMirror Node
		return {
			mapType: "node_custom",
			mapNode: (node: Md.ContainerDirective, children: ProseNode[]): ProseNode[] => {
				let result = this.nodeType.createAndFill({
					name: node.name,
					attributes : node.attributes
				}, children || undefined);
				return result ? [result] : [];
			}
		}
	}

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (node: ProseNode, children: Uni.Node[]): [Md.ContainerDirective] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let attrs = node.attrs as ContainerDirective_ProseAttrs;

			// create mdast node, without validating children
			let containerNode: AnyChildren<Md.ContainerDirective> = {
				type: this.mdastNodeType,
				children: children,
				name: attrs.name,
				attributes: attrs.attributes
			};

			// TODO (2021-05-17) validate node instead of casting
			return [containerNode as Md.ContainerDirective];
		}
	}}
}

////////////////////////////////////////////////////////////

export function inlineInputRule<S extends ProseSchema>(pattern: RegExp, nodeType: ProseNodeType, getAttrs?: (match: string[]) => any) {
	return new InputRule(pattern, (state, match, start, end) => {
		let $start = state.doc.resolve(start);
		let index = $start.index();
		let $end = state.doc.resolve(end);
		// get attrs
		let attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs
		// check if replacement valid
		if (!$start.parent.canReplaceWith(index, $end.index(), nodeType)) {
			return null;
		}
		// perform replacement
		return state.tr.replaceRangeWith(
			start, end,
			nodeType.create(attrs, nodeType.schema.text(match[1]))
		).insertText(match[2]);
	});
}

/* -- Citation ----------------------------------------------- */

import { MdParseState, AnyChildren } from "@common/markdown/mdast2prose";

export function citationRule<S extends ProseSchema>(nodeType: ProseNodeType): InputRule {
	return inlineInputRule(/@\[([^\s](?:[^\]]*[^\s])?)\](.)$/, nodeType);
}

export class CitationExtension extends NodeSyntaxExtension<Md.Cite> {

	get name() { return "citation" as const; }

	createNodeSpec() {
		return {
			content: "text*",
			group: "inline",
			inline: true,
			atom: true,
			attrs: {
				/** [@citation] if true, otherwise @[citation] */
				pandocSyntax: { default: false }
			},
			parseDOM: [{
				tag: "span.citation",
				getAttrs(node:Node|string) {
					return {
						pandocSyntax: (node as Element).classList.contains("citation-pandoc")
					};
				}
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				// NOTE:  this DOM serializer is only used when copy/pasting
				// any changes made here should also be reflected in the citation NodeView
				let pandocSytnax = (node.attrs.pandocSyntax === true);
				let attrs = {
					class: pandocSytnax ? "citation citation-pandoc" : "citation citation-alt"
				};
				return ["span", attrs, 0];
			}
		};
	}

	createKeymap(): ProseKeymap { return {
		//"Mod-@" : toggleMark(this.type)
	}}

	createInputRules() { return [citationRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "cite" as const };
	createMdastMap(): MdastNodeMap<Md.Cite> {
		// define map from Md.Heading -> ProseMirror Node
		return {
			mapType: "node_custom",
			mapNode: (node: Md.Cite, _): ProseNode[] => {
				let text = node.value;
				let attrs: ExtensionNodeAttrs<CitationExtension> = {
					pandocSyntax: false
				}
				// strip open/close bracket
				// alt: @[wadler1998 pp.82; and @hughes1999 sec 3.1]
				// pandoc: [see @wadler1998 pp.82; and @hughes1999 sec 3.1]
				let start = 0;
				let end = text.length;
				if(text[0] == "@" && text[1] == "[") { start = 2; attrs.pandocSyntax = false; }
				else if(text[0] == "[")              { start = 1; attrs.pandocSyntax = true;  }
				else { console.error(`invalid citation syntax: ${text}`); }

				if(text[end-1] == "]") { end--; }

				// create text node (stripping away open/close bracket)
				let textNode = this.store.schema.text(text.slice(start, end));
				let result = this.nodeType.createAndFill(attrs, [textNode]);
				return result ? [result] : [];
			}
		}
	}

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (node: ProseNode): [Md.Cite] => {
			// TODO (2021-05-17) better solution for casting attrs?
			let citeAttrs = node.attrs as ExtensionNodeAttrs<CitationExtension>;

			// surround node content with appropriate syntax
			let content = node.textContent;
			let citeSyntax: string;
			if(citeAttrs.pandocSyntax) { citeSyntax = `[${content}]`; }
			else                       { citeSyntax = `@[${content}]`; }

			// create mdast node
			return [{
				type: "cite",
				value: citeSyntax,
				data: {
				  altSyntax: (citeAttrs.pandocSyntax !== true) ? true : undefined,
					// TODO (2022/03/06) citeItems not properly converted (e.g. when multiple are present) -- need to parse value of cite node
					citeItems: [{
						key: content
					}]
				}
			}];
		}
	}}

}
