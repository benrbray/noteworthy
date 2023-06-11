// prosemirror imports
import { MarkType, MarkSpec, DOMOutputSpec, Mark as ProseMark } from "prosemirror-model";
import { InputRule } from "prosemirror-inputrules"
import { toggleMark } from "prosemirror-commands"

// project imports
import { markActive, markInputRule } from "@common/prosemirror/util/mark-utils";
import { openPrompt, TextField } from "@common/prompt/prompt";
import { MarkSyntaxExtension, MdastMarkMap, MdastMarkMapType, Prose2Mdast_MarkMap_Presets } from "@common/extensions/extension";

// mdast
import * as Uni from "unist";
import { AnyChildren, markMapBasic } from "@common/markdown/mdast2prose";
import { ProseKeymap } from "@common/types";

// noteworthy
import { Md, UnistUtils } from "@noteworthy/markdown";

//// MARK EXTENSIONS ///////////////////////////////////////

/* -- Bold ---------------------------------------------- */

export function boldRule(markType: MarkType):InputRule {
	return markInputRule(/\*\*([^\s](?:.*[^\s])?)\*\*(.)$/, markType);
}

/**
 * @compare to ReMirror BoldExtension, (https://github.com/remirror/remirror/blob/next/packages/%40remirror/extension-bold/src/bold-extension.ts)
 */
export class BoldExtension extends MarkSyntaxExtension<Md.Strong> {

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

	createInputRules(): InputRule[] {
		return [boldRule(this.markType)];
	}

	createKeymap(): ProseKeymap { return {
		"Mod-b" : toggleMark(this.markType),
		"Mod-B" : toggleMark(this.markType)
	}}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "strong" as const };
	createMdastMap() { return MdastMarkMapType.MARK_DEFAULT; }

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return Prose2Mdast_MarkMap_Presets.MARK_DEFAULT; }
}

/* -- Italic ---------------------------------------------- */

export function italicRule(markType: MarkType): InputRule {
	return markInputRule(/(?<!\*)\*(?:[^\s\*](.*[^\s])?)\*([^\*])$/, markType);
}

export class ItalicExtension extends MarkSyntaxExtension<Md.Emphasis> {

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

	createInputRules(): InputRule[] {
		return [italicRule(this.markType)];
	}

	createKeymap(): ProseKeymap { return {
		"Mod-i" : toggleMark(this.markType),
		"Mod-I" : toggleMark(this.markType)
	}}

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "emphasis" as const };
	createMdastMap() { return MdastMarkMapType.MARK_DEFAULT; }

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return Prose2Mdast_MarkMap_Presets.MARK_DEFAULT; }

}

/* -- Link ---------------------------------------- */

export class LinkExtension extends MarkSyntaxExtension<Md.Link> {

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
			toDOM(node: ProseMark): DOMOutputSpec { return ["a", node.attrs] }
		};
	}

	createKeymap(): ProseKeymap {
		return { "Mod-k" : (state, dispatch, view) => {
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

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: (mark: ProseMark, node: Uni.Node): Md.Link => {
			// TODO (2021-05-17) better solution for casting attrs?
			let linkAttrs = mark.attrs as { href: string, title:string|null };

			// create mdast node
			let linkNode: AnyChildren<Md.Link> = {
				type: this.mdastNodeType,
				url: linkAttrs.href,
				children: [node],
				...(linkAttrs.title ? { title : linkAttrs.title } : {}),
			};

			return (linkNode as Md.Link);
		}
	}}

}

/* -- Code ---------------------------------------------- */

export function inlineCodeRule(markType: MarkType): InputRule {
	return markInputRule(/`([^\s`](?:.*[^\s])?)` $/, markType);
}

export class CodeExtension extends MarkSyntaxExtension<Md.InlineCode> {

	get name() { return "code" as const; }

	createMarkSpec(): MarkSpec {
		return {
			inclusive: false,
			parseDOM: [{ tag: "code" }],
			toDOM(): DOMOutputSpec { return ["code"] }
		};
	}

	createKeymap(): ProseKeymap {
		// note: on mac, pressing Cmd+` does not register as an event
		// https://github.com/ProseMirror/prosemirror/issues/540
		return { "Ctrl-`" : toggleMark(this.markType) };
	}

	createInputRules() { return [inlineCodeRule(this.markType)]; }

	// -- Conversion from Mdast -> ProseMirror ---------- //

	get mdastNodeType() { return "inlineCode" as const };
	createMdastMap() { return MdastMarkMapType.MARK_LITERAL; }

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return Prose2Mdast_MarkMap_Presets.MARK_LITERAL; }
}

/* -- Wikilink ------------------------------------------ */

export function wikilinkRule(markType: MarkType): InputRule {
	return markInputRule(/\[\[([^\s](?:[^\]]*[^\s])?)\]\](.)$/, markType);
}

export class WikilinkExtension extends MarkSyntaxExtension<Md.Wikilink> {

	get name() { return "wikilink" as const; }

	createMarkSpec(): MarkSpec {
		return {
			attrs: { title: { default: null } },
			inclusive: false,
			parseDOM: [{ tag: "span.wikilink" }],
			toDOM(node: ProseMark): DOMOutputSpec { return ["span", Object.assign({ class: "wikilink" }, node.attrs)] }
		};
	}

	createKeymap(): ProseKeymap { return {
		"Mod-[" : toggleMark(this.markType)
	}}

	createInputRules() { return [wikilinkRule(this.markType)]; }

	get mdastNodeType() { return "wikiLink" as const };
	createMdastMap() { return MdastMarkMapType.MARK_LITERAL; }

	// -- Conversion from ProseMirror -> Mdast ---------- //

	prose2mdast() { return {
		create: <N extends Uni.Node>(mark: ProseMark, node: N): Md.Wikilink|N => {
			// expect string literal node
			if(!UnistUtils.unistIsStringLiteral(node)) {
				console.error(`mark type ${this.name} can only wrap Literal node ; skipping`);
				return node;
			}
			// TODO (2021-05-17) better solution for casting attrs?
			let wikiAttrs = mark.attrs as { title: string };

			// create mdast node
			// TODO (2021-05-19) how to correctly construct permalink/alias/exists properties for wikilink?
			return {
				type: this.mdastNodeType,
				value: node.value,
				data: {
					alias: node.value,
					permalink: node.value,
					exists: true
				}
			};
		}
	}}

}
