import { Schema, Node as ProseNode } from "prosemirror-model"

export const markdownSchema = new Schema({
	nodes: {
		doc: {
			content: "block+"
		},

		paragraph: {
			content: "inline*",
			attrs: { class: { default:undefined } },
			group: "block",
			parseDOM: [{ tag: "p" }],
			toDOM(node) { return ["p", { ...(node.attrs.class && { class: node.attrs.class }) }, 0] }
		},

		blockquote: {
			content: "block+",
			group: "block",
			parseDOM: [{ tag: "blockquote" }],
			toDOM() { return ["blockquote", 0] }
		},

		horizontal_rule: {
			group: "block",
			parseDOM: [{ tag: "hr" }],
			toDOM() { return ["div", ["hr"]] }
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
			toDOM(node) { return ["h" + node.attrs.level, 0] }
		},

		code_block: {
			content: "text*",
			group: "block",
			code: true,
			defining: true,
			marks: "",
			attrs: { params: { default: "" } },
			parseDOM: [{
				tag: "pre", preserveWhitespace: "full", getAttrs: node => (
					{ params: (node as HTMLElement).getAttribute("data-params") || "" }
				)
			}],
			toDOM(node) { return [
				"pre",
				{...(node.attrs.params && { "data-params" : node.attrs.params}) }, 
				["code", 0]] 
			}
		},

		ordered_list: {
			content: "list_item+",
			group: "block",
			attrs: { order: { default: 1 }, tight: { default: false } },
			parseDOM: [{
				tag: "ol", getAttrs(d) {
					let dom:HTMLElement = d as HTMLElement;
					return {
						order: +((dom.getAttribute("start")) || 1),
						tight: dom.hasAttribute("data-tight")
					}
				}
			}],
			toDOM(node) {
				return ["ol", {
					...((node.attrs.order == 1) && { start : node.attrs.order }),
					...(node.attrs.tight && { "data-tight" : "true" })
				}, 0]
			}
		},

		bullet_list: {
			content: "list_item+",
			group: "block",
			attrs: { tight: { default: false } },
			parseDOM: [{ tag: "ul", getAttrs: dom => ({ tight: (dom as HTMLElement).hasAttribute("data-tight") }) }],
			toDOM(node) { return ["ul", { ...(node.attrs.tight && { "data-tight" : "true"}) }, 0] }
		},

		list_item: {
			content: "paragraph block*",
			attrs: { class: { default: undefined } },
			defining: true,
			parseDOM: [{ tag: "li" }],
			toDOM(node) { return ["li", { ...(node.attrs.class && {class:node.attrs.class} ) }, 0] }
		},

		/** @todo (6/21/20) should this be a nodeview? better click handling */
		tasklist_item: {
			group: "inline",
			attrs: { label: { default: "" }, checked: { default: false } },
			inline: true,
			defining: true,
			parseDOM: [{
				tag: "input[type='checkbox']", getAttrs: d => {
					let dom: HTMLElement = d as HTMLElement;
					return {
						// for some reason ANY value of `checked` means TRUE
						checked: dom.hasAttribute("checked"),
						label: dom.getAttribute("label") || ""
					}
				}
			}],
			toDOM(node: ProseNode) {
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
				tag: "img[src]", getAttrs(d) {
					let dom = d as HTMLElement;
					return {
						src: dom.getAttribute("src"),
						title: dom.getAttribute("title"),
						alt: dom.getAttribute("alt")
					}
				}
			}],
			toDOM(node) { return ["img", node.attrs] }
		},

		hard_break: {
			inline: true,
			group: "inline",
			selectable: false,
			parseDOM: [{ tag: "br" }],
			toDOM() { return ["br"] }
		},
		math_inline: {
			group: "inline math",
			content: "text*",
			inline: true,
			atom: true,
			toDOM: () => ["math-inline", { class: "math-node" }, 0],
			parseDOM: [{
				tag: "math-inline"
			}]
		},
		math_display: {
			group: "block math",
			content: "text*",
			atom: true,
			code: true,
			toDOM: () => ["math-display", { class: "math-node" }, 0],
			parseDOM: [{
				tag: "math-display"
			}]
		},
	},

	marks: {
		em: {
			parseDOM: [{ tag: "i" }, { tag: "em" },
			{ style: "font-style", getAttrs: value => value == "italic" && null }],
			toDOM() { return ["em"] }
		},

		strong: {
			parseDOM: [{ tag: "b" }, { tag: "strong" },
			{ style: "font-weight", getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null }],
			toDOM() { return ["strong"] }
		},

		link: {
			attrs: {
				href: {},
				title: { default: null }
			},
			inclusive: false,
			parseDOM: [{
				tag: "a[href]", getAttrs(dom) {
					return {
						href: (dom as HTMLElement).getAttribute("href"), 
						title: (dom as HTMLElement).getAttribute("title")
					}
				}
			}],
			toDOM(node) { return ["a", node.attrs] }
		},

		code: {
			inclusive: false,
			parseDOM: [{ tag: "code" }],
			toDOM() { return ["code"] }
		},

		underline: {
			inclusive: false,
			parseDOM: [
				{ tag: "em.ul" },
				{ style: "text-decoration", getAttrs: value => value == "underline" && null }
			],
			toDOM() { return ["em", { class: "ul" }] }
		},

		strike: {
			inclusive: false,
			parseDOM: [
				{ tag: "s" },
				{ style: "text-decoration", getAttrs: value => value == "line-through" && null }
			],
			toDOM() { return ["s"] }
		},

		wikilink: {
			attrs: {
				title: { default: null }
			},
			inclusive: true,
			parseDOM: [{ tag: "span.wikilink" }],
			toDOM(node) { return ["span", Object.assign({ class: "wikilink" }, node.attrs)] }
		},

		tag: {
			attrs: {
				title: { default: null }
			},
			inclusive: true,
			parseDOM: [{ tag: "span.tag" }],
			toDOM(node) { return ["span", Object.assign({ class: "tag" }, node.attrs)] }
		},

		citation: {
			attrs: {
				title: { default: null }
			},
			inclusive: true,
			parseDOM: [{ tag: "span.citation" }],
			toDOM(node) { return ["span", Object.assign({ class: "citation" }, node.attrs)] }
		}
	}
})