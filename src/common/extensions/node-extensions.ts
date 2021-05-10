// prosemirror imports
import { Node as ProseNode, NodeSpec, DOMOutputSpec } from "prosemirror-model";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list"
import {
	wrappingInputRule, textblockTypeInputRule, InputRule,
} from "prosemirror-inputrules"
import {
	setBlockType, chainCommands, exitCode,
	Keymap,
} from "prosemirror-commands"

// unist imports
import * as Uni from "unist";
import * as Md from "mdast";

// project imports
import { openPrompt, TextField } from "@common/prompt/prompt";
import { incrHeadingLevelCmd } from "@common/prosemirror/commands/demoteHeadingCmd";
import { MdastNodeMap, MdastNodeMapType, NodeExtension } from "@common/extensions/extension";
import {
	makeInlineMathInputRule, makeBlockMathInputRule,
	REGEX_INLINE_MATH_DOLLARS_ESCAPED, REGEX_BLOCK_MATH_DOLLARS
} from "@benrbray/prosemirror-math";

// patched prosemirror types
import { ProseMarkType, ProseNodeType, ProseSchema } from "@common/types";

////////////////////////////////////////////////////////////

const mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false

//// NODE EXTENSIONS ///////////////////////////////////////

/* -- Paragraph ----------------------------------------- */

export class ParagraphExtension extends NodeExtension<Md.Paragraph> {

	// -- ProseMirror Schema -- //

	get name() { return "paragraph" as const; }

	createNodeSpec(): NodeSpec {
		return {
			content: "inline*",
			attrs: { class: { default: undefined } },
			group: "block",
			parseDOM: [{ tag: "p" }],
			toDOM(node: ProseNode): DOMOutputSpec { return ["p", { ...(node.attrs.class && { class: node.attrs.class }) }, 0] }
		};
	}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "paragraph" as const };
	createMdastMap() { return MdastNodeMapType.NODE_DEFAULT }
}

/* -- Block Quote --------------------------------------- */

// : (ProseNodeType) → InputRule
// Given a blockquote node type, returns an input rule that turns `"> "`
// at the start of a textblock into a blockquote.
export function blockQuoteRule<S extends ProseSchema>(nodeType:ProseNodeType<S>) {
	return wrappingInputRule(/^\s*>\s$/, nodeType)
}

export class BlockQuoteExtension extends NodeExtension<Md.Blockquote> {

	get name() { return "blockquote" as const; }

	createNodeSpec(): NodeSpec {
		return {
			content: "block+",
			group: "block",
			parseDOM: [{ tag: "blockquote" }],
			toDOM():DOMOutputSpec { return ["blockquote", 0] }
		};
	}

	createKeymap(): Keymap {
		return { "Ctrl->" : setBlockType(this.nodeType) }
	}
	
	createInputRules() { return [blockQuoteRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "blockquote" as const };
	createMdastMap() { return MdastNodeMapType.NODE_DEFAULT }

}

/* -- Heading ------------------------------------------- */

// : (ProseNodeType, number) → InputRule
// Given a node type and a maximum level, creates an input rule that
// turns up to that number of `#` characters followed by a space at
// the start of a textblock into a heading whose level corresponds to
// the number of `#` signs.
export function headingRule<S extends ProseSchema>(nodeType: ProseNodeType<S>, maxLevel:number) {
	return textblockTypeInputRule(new RegExp("^(#{1," + maxLevel + "})\\s$"),
		nodeType, match => ({ level: match[1].length }))
}

export class HeadingExtension extends NodeExtension<Md.Heading> {

	get name() { return "heading" as const; }

	/**
	 * @param _bottomType Is the NodeType that should be created when a
	 *     heading is demoted from H1 (normally, _bottomType = paragraph)
	 */
	constructor(private _bottomType: NodeExtension<any, any>) { super(); }

	createNodeSpec(): NodeSpec {
		return {
			attrs: { level: { default: 1 } },
			content: "(text | image)*",
			group: "block",
			defining: true,
			parseDOM: [{ tag: "h1", attrs: { level: 1 } },
			{ tag: "h2", attrs: { level: 2 } },
			{ tag: "h3", attrs: { level: 3 } },
			{ tag: "h4", attrs: { level: 4 } },
			{ tag: "h5", attrs: { level: 5 } },
			{ tag: "h6", attrs: { level: 6 } }],
			toDOM(node: ProseNode): DOMOutputSpec { return ["h" + node.attrs.level, 0] }
		};
	}

	createKeymap(): Keymap {
		let keymap:Keymap = {
			"Tab"       : incrHeadingLevelCmd(+1, { requireTextblockStart: false, requireEmptySelection: false }),
			"#"         : incrHeadingLevelCmd(+1, { requireTextblockStart: true,  requireEmptySelection: true  }),
			"Shift-Tab" : incrHeadingLevelCmd(-1, { requireTextblockStart: false, requireEmptySelection: false }, this._bottomType.nodeType),
			"Backspace" : incrHeadingLevelCmd(-1, { requireTextblockStart: true,  requireEmptySelection: true  }, this._bottomType.nodeType),
		};

		for(let i = 1; i <= 6; i++){
			keymap[`Shift-Ctrl-${i}`] = setBlockType(this.nodeType, { level : i });
		}

		return keymap;
	}
	
	createInputRules() { return [headingRule(this.nodeType, 6)]; }

	// -- Markdown Conversion -- //

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
}

/* -- Horizontal Rule ----------------------------------- */

export class HorizontalRuleExtension extends NodeExtension<Md.ThematicBreak> {

	get name() { return "horizontal_rule" as const; }

	createNodeSpec(): NodeSpec {
		return {
			group: "block",
			parseDOM: [{ tag: "hr" }],
			toDOM(): DOMOutputSpec { return ["div", ["hr"]] }
		};
	}

	createKeymap(): Keymap { return {
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
	createMdastMap() { return MdastNodeMapType.NODE_EMPTY }
}

/* -- Code Block ---------------------------------------- */

// : (ProseNodeType) → InputRule
// Given a code block node type, returns an input rule that turns a
// textblock starting with three backticks into a code block.
export function codeBlockRule<S extends ProseSchema>(nodeType: ProseNodeType<S>) {
	return textblockTypeInputRule(/^```$/, nodeType)
}

export class CodeBlockExtension extends NodeExtension<Md.Code> {

	get name() { return "code_block" as const; }

	createNodeSpec(): NodeSpec {
		return {
			content: "text*",
			group: "block",
			code: true,
			defining: true,
			marks: "",
			attrs: { params: { default: "" } },
			parseDOM: [{
				tag: "pre", preserveWhitespace: ("full" as "full"), getAttrs: (node:string|Node) => (
					{ params: (node as HTMLElement).getAttribute("data-params") || "" }
				)
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				return [
					"pre",
					{ ...(node.attrs.params && { "data-params": node.attrs.params }) },
					["code", 0]
				]
			}
		};
	}

	createKeyMap(): Keymap { return {
		"Shift-Ctrl-\\" : setBlockType(this.nodeType) };
	}
	
	createInputRules() { return [codeBlockRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "code" as const };
	createMdastMap() { return MdastNodeMapType.NODE_LITERAL }
}

// /* -- Ordered List -------------------------------------- */

// TODO: enabling lists requires a NodeExtension to be able to define multiple schema nodes
// or.... maybe each NodeExtension can also have a test() that it runs on 
// each node in the AST matching its mdastNodeType property
// so for OrdereDList it would be test(node: Md.List) { return node.ordered === true; } 

// : (ProseNodeType) → InputRule
// Given a list node type, returns an input rule that turns a number
// followed by a dot at the start of a textblock into an ordered list.
export function orderedListRule<S extends ProseSchema>(nodeType:ProseNodeType<S>) {
	return wrappingInputRule(/^(\d+)\.\s$/, nodeType, match => ({ order: +match[1] }),
		(match, node) => node.childCount + node.attrs.order == +match[1])
}

export class OrderedListExtension extends NodeExtension<Md.List> {

	get name() { return "ordered_list" as const; }

	createNodeSpec(): NodeSpec {
		return {
			content: "list_item+",
			group: "block",
			attrs: { order: { default: 1 }, tight: { default: false } },
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

	createKeymap(): Keymap { return {
		"Shift-Ctrl-9" : wrapInList(this.nodeType)
	}}
	
	createInputRules() { return [orderedListRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "list" as const };
	mdastNodeTest(node: Md.List) { return node.ordered === true; };
	createMdastMap() { return MdastNodeMapType.NODE_DEFAULT }
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
export function bulletListRule<S extends ProseSchema>(nodeType:ProseNodeType<S>) {
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

export class UnorderedListExtension extends NodeExtension<Md.List> {

	get name() { return "bullet_list" as const; }

	createNodeSpec(): NodeSpec {
		return {
			content: "list_item+",
			group: "block",
			attrs: { tight: { default: false }, bullet: { default: undefined } },
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

	createKeymap(): Keymap { return {
		"Shift-Ctrl-8" : wrapInList(this.nodeType)
	}}
	
	createInputRules() { return [bulletListRule(this.nodeType)]; }

	get mdastNodeType() { return "list" as const };
	mdastNodeTest(node: Md.List) { return node.ordered === false; };
	createMdastMap() { return MdastNodeMapType.NODE_DEFAULT }
}

/* -- List Item ----------------------------------------- */

export class ListItemExtension extends NodeExtension<Md.ListItem> {

	get name() { return "list_item" as const; }

	createNodeSpec(): NodeSpec {
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

	createKeymap(): Keymap { return {
		"Enter"     : splitListItem(this.nodeType),
		"Shift-Tab" : liftListItem(this.nodeType),
		"Tab"       : sinkListItem(this.nodeType)
	}}

	get mdastNodeType() { return "listItem" as const };
	createMdastMap() { return MdastNodeMapType.NODE_DEFAULT }
}

/* -- Unordered List ------------------------------------ */

export class ImageExtension extends NodeExtension<Md.Image> {

	get name() { return "image" as const; }

	createNodeSpec(): NodeSpec {
		return {
			inline: true,
			attrs: {
				src: {},
				alt: { default: null },
				title: { default: null }
			},
			group: "inline",
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
				return result ? [result] : [];
			}
		}
	}
}

/* -- Hard Break ---------------------------------------- */

export class HardBreakExtension extends NodeExtension<Md.Break> {

	get name() { return "hard_break" as const; }

	createNodeSpec(): NodeSpec {
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
	
}

/* -- Inline Math --------------------------------------- */

/** Inline math node from [`mdast-util-math`](https://github.com/syntax-tree/mdast-util-math/blob/main/from-markdown.js#L60). */
interface MdBlockMath extends Md.Literal {
	type: "math"
}

/** Block math node from [`mdast-util-math`](https://github.com/syntax-tree/mdast-util-math/blob/main/from-markdown.js#L20). */
interface MdInlineMath extends Md.Literal {
	type: "inlineMath"
}

export class InlineMathExtension extends NodeExtension<MdInlineMath> {

	get name() { return "math_inline" as const; }

	createNodeSpec(): NodeSpec {
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
}

/* -- Block Math --------------------------------------- */

export class BlockMathExtension extends NodeExtension<MdBlockMath> {

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
}

/* -- Region -------------------------------------------- */

// TODO (2021/05/09) Markdown Directives Plugin for Remark

// export class RegionExtension extends NodeExtension {

// 	get name() { return "region" as const; }

// 	createNodeSpec(): NodeSpec {
// 		return {
// 			content: "block+",
// 			attrs: { "region" : { default: null } },
// 			parseDOM: [{ 
// 				tag: "div.region",
// 				getAttrs(d:string|Node){
// 					let dom: HTMLElement = d as HTMLElement;
// 					return {
// 						...(dom.hasAttribute("data-region") && { "region": dom.getAttribute("data-region") })
// 					}
// 				}
// 			}],
// 			toDOM(node: ProseNode): DOMOutputSpec {
// 				return ["div", { 
// 					class: "region",
// 					...( node.attrs.region && { "data-region": node.attrs.region } )
// 				}, 0];
// 			}
// 		};
// 	}

// 	createKeymap(): Keymap { return {
// 		"Mod-r" : (state, dispatch, view) => {
// 			let { $to } = state.selection;

// 			openPrompt({
// 				title: "Create Region",
// 				fields: {
// 					region: new TextField({
// 						label: "Region Name",
// 						required: true
// 					}),
// 				},
// 				callback(attrs: { [key: string]: any; } | undefined) {
// 					// insert new embed node at top level
// 					let tr = state.tr.insert($to.after(1), this.type.createAndFill(attrs))
// 					if(dispatch){ dispatch(tr); }
// 					if(view){ view.focus(); }
// 				}
// 			})
// 			return true;
// 		}
// 	}}
// }

/* -- Embed -------------------------------------------- */

// export class EmbedExtension extends NodeExtension {

// 	get name() { return "embed" as const; }

// 	createNodeSpec(): NodeSpec {
// 		return {
// 			content: "block+",
// 			group: "embed",
// 			atom: true,
// 			attrs: {
// 				fileName: {default: "" },
// 				regionName : { default: "" },
// 			},
// 			parseDOM: [{
// 				tag: "div.embed",
// 				getAttrs(d: string| Node){
// 					let dom: HTMLElement = d as HTMLElement;
// 					return {
// 						...(dom.hasAttribute("data-fileName") && { fileName: dom.getAttribute("data-fileName") }),
// 						...(dom.hasAttribute("data-regionName") && { regionName: dom.getAttribute("data-regionName")})
// 					}
// 				}
// 			}],
// 			toDOM(node: ProseNode): DOMOutputSpec {
// 				return ["div", {
// 					class: "embed",
// 					...node.attrs
// 				}, 0];
// 			}
// 		};
// 	}

// 	createKeymap(): Keymap { return {
// 		"Mod-m" : (state, dispatch, view) => {
// 			let { $to } = state.selection;

// 			openPrompt({
// 				title: "Embed Region",
// 				fields: {
// 					fileName: new TextField({
// 						label: "File Name",
// 						required: true
// 					}),
// 					regionName: new TextField({
// 						label: "Region Name",
// 						required: true
// 					}),
// 				},
// 				callback(attrs: { [key: string]: any; } | undefined) {
// 					// insert new embed node at top level
// 					let tr = state.tr.insert($to.after(1), this.type.createAndFill(attrs))
// 					if(dispatch){ dispatch(tr); }
// 					if(view){ view.focus(); }
// 				}
// 			})
// 			return true;
// 		}
// 	}}

// }

////////////////////////////////////////////////////////////

export function inlineInputRule<S extends ProseSchema>(pattern: RegExp, nodeType: ProseNodeType<S>, getAttrs?: (match: string[]) => any) {
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
		);
	});
}

/* -- Citation ----------------------------------------------- */

export function citationRule<S extends ProseSchema>(nodeType: ProseNodeType<S>): InputRule {
	return inlineInputRule(/@\[([^\s](?:[^\]]*[^\s])?)\](.)$/, nodeType);
}

import { InlineCiteNode as MdCite } from "@benrbray/mdast-util-cite";

export class CitationExtension extends NodeExtension<MdCite> {
	
	get name() { return "citation" as const; }
	
	createNodeSpec(): NodeSpec {
		return {
			content: "text*",
			group: "inline",
			inline: true,
			atom: true,
			attrs: { title: { default: null } },
			parseDOM: [{ tag: "span.citation" }],
			toDOM(node: ProseNode): DOMOutputSpec { return ["span", Object.assign({ class: "citation" }, node.attrs), 0] }
		};
	}

	createKeymap(): Keymap { return {
		//"Mod-@" : toggleMark(this.type)
	}}

	createInputRules() { return [citationRule(this.nodeType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "cite" as const };
	createMdastMap(): MdastNodeMap<MdCite> {
		// define map from Md.Heading -> ProseMirror Node
		return {
			mapType: "node_custom",
			mapNode: (node: MdCite, _): ProseNode[] => {
				let text = this.store.schema.text(node.value);
				let result = this.nodeType.createAndFill({}, [text]);
				return result ? [result] : [];
			}
		}
	}

}