// prosemirror imports
import { NodeType, Node as ProseNode, NodeSpec, DOMOutputSpec } from "prosemirror-model";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list"
import {
	wrappingInputRule, textblockTypeInputRule, InputRule,
} from "prosemirror-inputrules"
import {
	setBlockType, chainCommands, exitCode,
	Keymap,
} from "prosemirror-commands"

// project imports
import { openPrompt, TextField } from "@common/prompt/prompt";
import { incrHeadingLevelCmd } from "@common/prosemirror/commands/demoteHeadingCmd";
import { NodeExtension } from "@common/extensions/extension";
import {
	makeInlineMathInputRule, makeBlockMathInputRule,
	REGEX_INLINE_MATH_DOLLARS_ESCAPED, REGEX_BLOCK_MATH_DOLLARS
} from "@benrbray/prosemirror-math";

////////////////////////////////////////////////////////////

const mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false

//// NODE EXTENSIONS ///////////////////////////////////////

/* -- Paragraph ----------------------------------------- */

export class ParagraphExtension extends NodeExtension {

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
}

/* -- Block Quote --------------------------------------- */

// : (NodeType) → InputRule
// Given a blockquote node type, returns an input rule that turns `"> "`
// at the start of a textblock into a blockquote.
export function blockQuoteRule(nodeType:NodeType) {
	return wrappingInputRule(/^\s*>\s$/, nodeType)
}

export class BlockQuoteExtension extends NodeExtension {

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
		return { "Ctrl->" : setBlockType(this.type) }
	}
	
	createInputRules() { return [blockQuoteRule(this.type)]; }
}

/* -- Heading ------------------------------------------- */

// : (NodeType, number) → InputRule
// Given a node type and a maximum level, creates an input rule that
// turns up to that number of `#` characters followed by a space at
// the start of a textblock into a heading whose level corresponds to
// the number of `#` signs.
export function headingRule(nodeType: NodeType, maxLevel:number) {
	return textblockTypeInputRule(new RegExp("^(#{1," + maxLevel + "})\\s$"),
		nodeType, match => ({ level: match[1].length }))
}

export class HeadingExtension extends NodeExtension {

	get name() { return "heading" as const; }

	constructor(private _bottomType:NodeExtension) { super(); }

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
			"Shift-Tab" : incrHeadingLevelCmd(-1, { requireTextblockStart: false, requireEmptySelection: false }, this._bottomType.type),
			"Backspace" : incrHeadingLevelCmd(-1, { requireTextblockStart: true,  requireEmptySelection: true  }, this._bottomType.type),
		};

		for(let i = 1; i <= 6; i++){
			keymap[`Shift-Ctrl-${i}`] = setBlockType(this.type, { level : i });
		}

		return keymap;
	}
	
	createInputRules() { return [headingRule(this.type, 6)]; }
}

/* -- Horizontal Rule ----------------------------------- */

export class HorizontalRuleExtension extends NodeExtension {

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
				dispatch(state.tr.replaceSelectionWith(this.type.create()).scrollIntoView())
			}
			return true
		} 
	}}
	
	createInputRules() { return [/** @todo (9/27/20) hrule inputRule */]; }
}

/* -- Code Block ---------------------------------------- */

// : (NodeType) → InputRule
// Given a code block node type, returns an input rule that turns a
// textblock starting with three backticks into a code block.
export function codeBlockRule(nodeType: NodeType) {
	return textblockTypeInputRule(/^```$/, nodeType)
}

export class CodeBlockExtension extends NodeExtension {

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
					["code", 0]]
			}
		};
	}

	createKeyMap(): Keymap { return {
		"Shift-Ctrl-\\" : setBlockType(this.type) };
	}
	
	createInputRules() { return [codeBlockRule(this.type)]; }
}

/* -- Ordered List -------------------------------------- */

// : (NodeType) → InputRule
// Given a list node type, returns an input rule that turns a number
// followed by a dot at the start of a textblock into an ordered list.
export function orderedListRule(nodeType:NodeType) {
	return wrappingInputRule(/^(\d+)\.\s$/, nodeType, match => ({ order: +match[1] }),
		(match, node) => node.childCount + node.attrs.order == +match[1])
}

export class OrderedListExtension extends NodeExtension {

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
		"Shift-Ctrl-9" : wrapInList(this.type)
	}}
	
	createInputRules() { return [orderedListRule(this.type)]; }
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

// : (NodeType) → InputRule
// Given a list node type, returns an input rule that turns a bullet
// (dash, plush, or asterisk) at the start of a textblock into a
// bullet list.
export function bulletListRule(nodeType:NodeType) {
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

export class UnorderedListExtension extends NodeExtension {

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
		"Shift-Ctrl-8" : wrapInList(this.type)
	}}
	
	createInputRules() { return [bulletListRule(this.type)]; }
}

/* -- List Item ----------------------------------------- */

export class ListItemExtension extends NodeExtension {

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
		"Enter"     : splitListItem(this.type),
		"Shift-Tab" : liftListItem(this.type),
		"Tab"       : sinkListItem(this.type)
	}}
}

/* -- Unordered List ------------------------------------ */

export class ImageExtension extends NodeExtension {

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
}

/* -- Hard Break ---------------------------------------- */

export class HardBreakExtension extends NodeExtension {

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
				dispatch(state.tr.replaceSelectionWith(this.type.create()).scrollIntoView())
			}
			return true
		})

		return {
			"Mod-Enter": cmd,
			"Shift-Enter": cmd,
			...(mac && { "Ctrl-Enter" : cmd })
		}
	}
}

/* -- Inline Math --------------------------------------- */

export class InlineMathExtension extends NodeExtension {

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

	createInputRules() { return [makeInlineMathInputRule(REGEX_INLINE_MATH_DOLLARS_ESCAPED, this.type)]; }
}

/* -- Block Math --------------------------------------- */

export class BlockMathExtension extends NodeExtension {

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

	createInputRules() { return [makeBlockMathInputRule(REGEX_BLOCK_MATH_DOLLARS, this.type)]; }
}

/* -- Region -------------------------------------------- */

export class RegionExtension extends NodeExtension {

	get name() { return "region" as const; }

	createNodeSpec(): NodeSpec {
		return {
			content: "block+",
			attrs: { "region" : { default: null } },
			parseDOM: [{ 
				tag: "div.region",
				getAttrs(d:string|Node){
					let dom: HTMLElement = d as HTMLElement;
					return {
						...(dom.hasAttribute("data-region") && { "region": dom.getAttribute("data-region") })
					}
				}
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				return ["div", { 
					class: "region",
					...( node.attrs.region && { "data-region": node.attrs.region } )
				}, 0];
			}
		};
	}

	createKeymap(): Keymap { return {
		"Mod-r" : (state, dispatch, view) => {
			let { $to } = state.selection;

			openPrompt({
				title: "Create Region",
				fields: {
					region: new TextField({
						label: "Region Name",
						required: true
					}),
				},
				callback(attrs: { [key: string]: any; } | undefined) {
					// insert new embed node at top level
					let tr = state.tr.insert($to.after(1), this.type.createAndFill(attrs))
					if(dispatch){ dispatch(tr); }
					if(view){ view.focus(); }
				}
			})
			return true;
		}
	}}
}

/* -- Embed -------------------------------------------- */

export class EmbedExtension extends NodeExtension {

	get name() { return "embed" as const; }

	createNodeSpec(): NodeSpec {
		return {
			content: "block+",
			group: "embed",
			atom: true,
			attrs: {
				fileName: {default: "" },
				regionName : { default: "" },
			},
			parseDOM: [{
				tag: "div.embed",
				getAttrs(d: string| Node){
					let dom: HTMLElement = d as HTMLElement;
					return {
						...(dom.hasAttribute("data-fileName") && { fileName: dom.getAttribute("data-fileName") }),
						...(dom.hasAttribute("data-regionName") && { regionName: dom.getAttribute("data-regionName")})
					}
				}
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				return ["div", {
					class: "embed",
					...node.attrs
				}, 0];
			}
		};
	}

	createKeymap(): Keymap { return {
		"Mod-m" : (state, dispatch, view) => {
			let { $to } = state.selection;

			openPrompt({
				title: "Embed Region",
				fields: {
					fileName: new TextField({
						label: "File Name",
						required: true
					}),
					regionName: new TextField({
						label: "Region Name",
						required: true
					}),
				},
				callback(attrs: { [key: string]: any; } | undefined) {
					// insert new embed node at top level
					let tr = state.tr.insert($to.after(1), this.type.createAndFill(attrs))
					if(dispatch){ dispatch(tr); }
					if(view){ view.focus(); }
				}
			})
			return true;
		}
	}}

}

////////////////////////////////////////////////////////////

export function inlineInputRule(pattern: RegExp, nodeType: NodeType, getAttrs?: (match: string[]) => any) {
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

export function citationRule(nodeType: NodeType): InputRule {
	return inlineInputRule(/@\[([^\s](?:[^\]]*[^\s])?)\](.)$/, nodeType);
}

export class CitationExtension extends NodeExtension {
	
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

	createInputRules() { return [citationRule(this.type)]; }

}