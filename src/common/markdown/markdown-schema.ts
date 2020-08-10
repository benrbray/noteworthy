import { Schema, Node as ProseNode, SchemaSpec, Mark, DOMOutputSpec } from "prosemirror-model"

function normalizeBullet(bullet:string|undefined): string {
	switch(bullet){
		case "*": return "\u2022";
		case "+": return "+";
		// https://en.wikipedia.org/wiki/Hyphen
		case "\u2010": return "\u002D"; /* hyphen */
		case "\u2011": return "\u002D"; /* non-breaking hyphen */
		case "\u2212": return "\u002D"; /* minus */
		case "\u002D": return "\u002D"; /* hyphen-minus */
		default: return "\u2022";
	}
}

export function markdownSpec() { return {
	nodes: {
		doc: {
			content: "(block|region)+",
			attrs: { yamlMeta: { default: {} } }
		},

		region: {
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
		},

		paragraph: {
			content: "inline*",
			attrs: { class: { default: undefined } },
			group: "block",
			parseDOM: [{ tag: "p" }],
			toDOM(node: ProseNode): DOMOutputSpec { return ["p", { ...(node.attrs.class && { class: node.attrs.class }) }, 0] }
		},

		blockquote: {
			content: "block+",
			group: "block",
			parseDOM: [{ tag: "blockquote" }],
			toDOM():DOMOutputSpec { return ["blockquote", 0] }
		},

		horizontal_rule: {
			group: "block",
			parseDOM: [{ tag: "hr" }],
			toDOM(): DOMOutputSpec { return ["div", ["hr"]] }
		},

		heading: {
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
		},

		code_block: {
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
		},

		ordered_list: {
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
		},

		bullet_list: {
			content: "list_item+",
			group: "block",
			attrs: { tight: { default: false }, bullet: { default: "*" } },
			parseDOM: [{
				tag: "ul",
				getAttrs: (dom:string|Node) => ({
					tight: (dom as HTMLElement).hasAttribute("data-tight")
				})
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				return ["ul", {
					...(node.attrs.tight && { "data-tight": "true" }),
					...(node.attrs.bullet && { "data-bullet" : normalizeBullet(node.attrs.bullet || "*") })
				}, 0]
			}
		},

		list_item: {
			content: "paragraph block*",
			attrs: { class: { default: undefined }, bullet: { default: "*" } },
			defining: true,
			parseDOM: [{
				tag: "li",
				getAttrs: (dom:string|Node) => ({
					bullet: (dom as HTMLElement).dataset.bullet
				})
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				return ["li", {
					...(node.attrs.class && { class: node.attrs.class }),
					...(node.attrs.bullet && { "data-bullet" : normalizeBullet(node.attrs.bullet) })
				}, 0];
			}
		},

		/** @todo (6/21/20) should this be a nodeview? better click handling */
		tasklist_item: {
			group: "inline",
			attrs: { label: { default: "" }, checked: { default: false } },
			inline: true,
			defining: true,
			parseDOM: [{
				tag: "input[type='checkbox']", getAttrs: (d:string|Node) => {
					let dom: HTMLElement = d as HTMLElement;
					return {
						// for some reason ANY value of `checked` means TRUE
						checked: dom.hasAttribute("checked"),
						label: dom.getAttribute("label") || ""
					}
				}
			}],
			toDOM(node: ProseNode): DOMOutputSpec {
				return ["input", {
					type: "checkbox",
					...((node.attrs.checked !== false) && { checked: "checked" }),
				}, 0]
			}
		},

		text: {
			group: "inline"
		},

		image: {
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
		},

		hard_break: {
			inline: true,
			group: "inline",
			selectable: false,
			parseDOM: [{ tag: "br" }],
			toDOM(): DOMOutputSpec { return ["br"] }
		},
		math_inline: {
			group: "inline math",
			content: "text*",
			inline: true,
			atom: true,
			toDOM(): DOMOutputSpec { return ["math-inline", { class: "math-node" }, 0]; },
			parseDOM: [{
				tag: "math-inline"
			}]
		},
		math_display: {
			group: "block math",
			content: "text*",
			atom: true,
			code: true,
			toDOM(): DOMOutputSpec { return ["math-display", { class: "math-node" }, 0]; },
			parseDOM: [{
				tag: "math-display"
			}]
		},
	},

	marks: {
		em: {
			parseDOM: [{ tag: "i" }, { tag: "em" },
			{ style: "font-style", getAttrs: (value:string|Node) => value == "italic" && null }],
			toDOM(): DOMOutputSpec { return ["em"] }
		},

		strong: {
			parseDOM: [{ tag: "b" }, { tag: "strong" },
			{ style: "font-weight", getAttrs: (value:string|Node) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null }],
			toDOM(): DOMOutputSpec { return ["strong"] }
		},

		definition: {
			parseDOM: [{ tag: "dfn" }],
			toDOM(): DOMOutputSpec { return ["dfn"] }
		},

		link: {
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
		},

		code: {
			inclusive: false,
			parseDOM: [{ tag: "code" }],
			toDOM(): DOMOutputSpec { return ["code"] }
		},

		underline: {
			inclusive: false,
			parseDOM: [
				{ tag: "em.ul" },
				{ style: "text-decoration", getAttrs: (value:string|Node) => value == "underline" && null }
			],
			toDOM(): DOMOutputSpec { return ["em", { class: "ul" }] }
		},

		strike: {
			inclusive: false,
			parseDOM: [
				{ tag: "s" },
				{ style: "text-decoration", getAttrs: (value:string|Node) => value == "line-through" && null }
			],
			toDOM(): DOMOutputSpec { return ["s"] }
		},

		wikilink: {
			attrs: {
				title: { default: null }
			},
			inclusive: false,
			parseDOM: [{ tag: "span.wikilink" }],
			toDOM(node: Mark): DOMOutputSpec { return ["span", Object.assign({ class: "wikilink" }, node.attrs)] }
		},

		tag: {
			attrs: {
				title: { default: null }
			},
			inclusive: false,
			parseDOM: [{ tag: "span.tag" }],
			toDOM(node: Mark): DOMOutputSpec { return ["span", Object.assign({ class: "tag" }, node.attrs)] }
		},

		citation: {
			attrs: {
				title: { default: null }
			},
			inclusive: false,
			parseDOM: [{ tag: "span.citation" }],
			toDOM(node: Mark): DOMOutputSpec { return ["span", Object.assign({ class: "citation" }, node.attrs)] }
		}
	}
}}

export const markdownSchema = new Schema(markdownSpec());