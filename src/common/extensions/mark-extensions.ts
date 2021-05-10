// prosemirror imports
import { MarkType, MarkSpec, DOMOutputSpec, Mark } from "prosemirror-model";
import { InputRule } from "prosemirror-inputrules"
import { toggleMark, Keymap } from "prosemirror-commands"

// project imports
import { markActive, markInputRule } from "@common/prosemirror/util/mark-utils";
import { openPrompt, TextField } from "@common/prompt/prompt";
import { MarkExtension, MdastMarkMap, MdastMarkMapType } from "@common/extensions/extension";

// mdast
import * as Md from "mdast";
import { markMapBasic } from "@common/markdown/mdast2prose";

//// MARK EXTENSIONS ///////////////////////////////////////

/* -- Bold ---------------------------------------------- */

export function boldRule(markType: MarkType):InputRule {
	return markInputRule(/\*\*([^\s](?:.*[^\s])?)\*\*(.)$/, markType);
}

/**
 * @compare to ReMirror BoldExtension, (https://github.com/remirror/remirror/blob/next/packages/%40remirror/extension-bold/src/bold-extension.ts)
 */
export class BoldExtension extends MarkExtension<Md.Strong> {
	
	get name() { return "strong" as const; }
	
	createMarkSpec(): MarkSpec {
		return {
			parseDOM: [
				{ tag: "b" },
				{ tag: "strong" },
				{ style: "font-weight", getAttrs: (value:string|Node) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null }
			],
			toDOM(): DOMOutputSpec { return ["strong"] }
		};
	}

	createInputRules(): InputRule<any>[] {
		return [boldRule(this.markType)];
	}

	createKeymap(): Keymap { return { 
		"Mod-b" : toggleMark(this.markType),
		"Mod-B" : toggleMark(this.markType)
	}}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "strong" as const };
	createMdastMap() { return MdastMarkMapType.MARK_DEFAULT; }

}

/* -- Italic ---------------------------------------------- */

export function italicRule(markType: MarkType): InputRule {
	return markInputRule(/(?<!\*)\*(?:[^\s\*](.*[^\s])?)\*([^\*])$/, markType);
}

export class ItalicExtension extends MarkExtension<Md.Emphasis> {
	
	get name() { return "em" as const; }
	
	createMarkSpec(): MarkSpec {
		return {
			parseDOM: [
				{ tag: "i" },
				{ tag: "em" },
				{ style: "font-style", getAttrs: (value:string|Node) => value == "italic" && null }
			],
			toDOM(): DOMOutputSpec { return ["em"] }
		};
	}

	createInputRules(): InputRule<any>[] {
		return [italicRule(this.markType)];
	}

	createKeymap(): Keymap { return { 
		"Mod-i" : toggleMark(this.markType),
		"Mod-I" : toggleMark(this.markType)
	}}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "emphasis" as const };
	createMdastMap() { return MdastMarkMapType.MARK_DEFAULT; }

}

/* -- Definition ---------------------------------------- */

// TODO: (2021/05/09) restore definitions

// export class DefinitionExtension extends MarkExtension {
	
// 	get name() { return "definition" as const; }
	
// 	createMarkSpec(): MarkSpec {
// 		return {
// 			parseDOM: [{ tag: "dfn" }],
// 			toDOM(): DOMOutputSpec { return ["dfn"] }
// 		};
// 	}

// 	createKeymap(): Keymap { return { 
// 		"Mod-d" : toggleMark(this.type),
// 		"Mod-D" : toggleMark(this.type)
// 	}}

// }

/* -- Link ---------------------------------------- */

export class LinkExtension extends MarkExtension<Md.Link> {
	
	get name() { return "link" as const; }
	
	createMarkSpec(): MarkSpec {
		return {
			attrs: {
				href: {},
				title: { default: null }
			},
			inclusive: false,
			parseDOM: [{
				tag: "a[href]", getAttrs(dom:string|Node) {
					return {
						href: (dom as HTMLElement).getAttribute("href"),
						title: (dom as HTMLElement).getAttribute("title")
					}
				}
			}],
			toDOM(node: Mark): DOMOutputSpec { return ["a", node.attrs] }
		};
	}

	createKeymap(): Keymap {
		return { "Ctrl-k" : (state, dispatch, view) => {
			// only insert link when highlighting text
			if(state.selection.empty){ return false; }

			let markType = this.markType
			if(markActive(state, markType)) {
				console.log("link active");
				toggleMark(markType)(state, dispatch)
				return true
			}

			openPrompt({
				title: "Create a link",
				fields: {
					href: new TextField({
						label: "Link target",
						required: true
					}),
					title: new TextField({ label: "Title" })
				},
				callback(attrs: { [key: string]: any; } | undefined) {
					if(!view){ return; }
					toggleMark(markType, attrs)(view.state, view.dispatch)
					view.focus()
				}
			})
			return true;
		} };
	}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "link" as const };
	createMdastMap(): MdastMarkMap<Md.Link> { 
		return {
			mapType: "mark_custom",
			mapMark: markMapBasic(this.markType, node => ({
				href:  node.url,
				title: node.title
			}))
		}
	}

}

/* -- Underline ---------------------------------------- */

// TODO (2021/05/09) restore underline

// export function underlineRule(markType: MarkType): InputRule {
// 	return markInputRule(/(?<![^\s])_([^\s_](?:.*[^\s_])?)_(.)$/, markType);
// }

// export class UnderlineExtension extends MarkExtension {
	
// 	get name() { return "underline" as const; }
	
// 	createMarkSpec(): MarkSpec {
// 		return {
// 			inclusive: false,
// 			parseDOM: [
// 				{ tag: "em.ul" },
// 				{ style: "text-decoration", getAttrs: (value:string|Node) => value == "underline" && null }
// 			],
// 			toDOM(): DOMOutputSpec { return ["em", { class: "ul" }] }
// 		};
// 	}

// 	createKeymap(): Keymap { return {
// 		"Mod-u" : toggleMark(this.type)
// 	}}

// 	createInputRules() { return [underlineRule(this.type)]; }

// }

/* -- Code ---------------------------------------------- */

export class CodeExtension extends MarkExtension<Md.InlineCode> {
	
	get name() { return "code" as const; }
	
	createMarkSpec(): MarkSpec {
		return {
			inclusive: false,
			parseDOM: [{ tag: "code" }],
			toDOM(): DOMOutputSpec { return ["code"] }
		};
	}

	createKeymap(): Keymap {
		return { "Mod-`" : toggleMark(this.markType) };
	}

	createInputRules() { return [/** @todo (9/27/20) code input rule */]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "inlineCode" as const };
	createMdastMap() { return MdastMarkMapType.MARK_DEFAULT; }
}

/* -- Strikethrough ---------------------------------------- */

// TODO (2021-05-09) reinstate strike rule

// export function strikeRule(markType: MarkType): InputRule {
// 	return markInputRule(/~([^\s~](?:.*[^\s~])?)~(.)$/, markType);
// }

// export class StrikethroughExtension extends MarkExtension {
	
// 	get name() { return "strike" as const; }
	
// 	createMarkSpec(): MarkSpec {
// 		return {
// 			inclusive: false,
// 			parseDOM: [
// 				{ tag: "em.ul" },
// 				{ style: "text-decoration", getAttrs: (value:string|Node) => value == "underline" && null }
// 			],
// 			toDOM(): DOMOutputSpec { return ["em", { class: "ul" }] }
// 		};
// 	}

// 	createKeymap(): Keymap { return {
// 		"Mod-u" : toggleMark(this.type)
// 	}}

// 	createInputRules() { return [strikeRule(this.type)]; }

// }

/* -- Wikilink ------------------------------------------ */

export function wikilinkRule(markType: MarkType): InputRule {
	return markInputRule(/\[\[([^\s](?:[^\]]*[^\s])?)\]\](.)$/, markType);
}

/** Block math node from [`mdast-util-math`](https://github.com/syntax-tree/mdast-util-math/blob/main/from-markdown.js#L20). */
interface MdWikilink extends Md.Literal {
	type: "wikiLink"
}

export class WikilinkExtension extends MarkExtension<MdWikilink> {
	
	get name() { return "wikilink" as const; }
	
	createMarkSpec(): MarkSpec {
		return {
			attrs: { title: { default: null } },
			inclusive: false,
			parseDOM: [{ tag: "span.wikilink" }],
			toDOM(node: Mark): DOMOutputSpec { return ["span", Object.assign({ class: "wikilink" }, node.attrs)] }
		};
	}

	createKeymap(): Keymap { return {
		"Mod-[" : toggleMark(this.markType) 
	}}

	createInputRules() { return [wikilinkRule(this.markType)]; }

	get mdastNodeType() { return "wikiLink" as const };
	createMdastMap() { return MdastMarkMapType.MARK_LITERAL; }

}

/* -- Tag ----------------------------------------------- */

// TODO (2021-05-09) restore tag syntax

// export function tagRule(markType: MarkType): InputRule {
// 	return markInputRule(/#([a-zA-Z0-9-:_/\\]+)([^a-zA-Z0-9-:_/\\])$/, markType);
// }
// export function tagRuleBracketed(markType: MarkType): InputRule {
// 	return markInputRule(/#\[([^\s](?:[^\]]*[^\s])?)\](.)$/, markType);
// }

// export class TagExtension extends MarkExtension {
	
// 	get name() { return "tag" as const; }
	
// 	createMarkSpec(): MarkSpec {
// 		return {
// 			attrs: { title: { default: null }},
// 			inclusive: false,
// 			parseDOM: [{ tag: "span.tag" }],
// 			toDOM(node: Mark): DOMOutputSpec { return ["span", Object.assign({ class: "tag" }, node.attrs)] }
// 		};
// 	}

// 	createInputRules() { return [tagRule(this.type), tagRuleBracketed(this.type)]; }

// }