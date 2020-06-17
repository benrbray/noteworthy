import markdownit from "markdown-it"
import { math_plugin } from "./markdown-it-katex"
import { Schema, Mark } from "prosemirror-model"

export const markdownSchema = new Schema({
	nodes: {
		doc: {
			content: "block+"
		},

		paragraph: {
			content: "inline*",
			group: "block",
			parseDOM: [{tag: "p"}],
			toDOM() { return ["p", 0] }
		},

		blockquote: {
			content: "block+",
			group: "block",
			parseDOM: [{tag: "blockquote"}],
			toDOM() { return ["blockquote", 0] }
		},

		horizontal_rule: {
			group: "block",
			parseDOM: [{tag: "hr"}],
			toDOM() { return ["div", ["hr"]] }
		},

		heading: {
			attrs: {level: {default: 1}},
			content: "(text | image)*",
			group: "block",
			defining: true,
			parseDOM: [{tag: "h1", attrs: {level: 1}},
								 {tag: "h2", attrs: {level: 2}},
								 {tag: "h3", attrs: {level: 3}},
								 {tag: "h4", attrs: {level: 4}},
								 {tag: "h5", attrs: {level: 5}},
								 {tag: "h6", attrs: {level: 6}}],
			toDOM(node) { return ["h" + node.attrs.level, 0] }
		},

		code_block: {
			content: "text*",
			group: "block",
			code: true,
			defining: true,
			marks: "",
			attrs: {params: {default: ""}},
			parseDOM: [{tag: "pre", preserveWhitespace: "full", getAttrs: node => (
				{params: node.getAttribute("data-params") || ""}
			)}],
			toDOM(node) { return ["pre", node.attrs.params ? {"data-params": node.attrs.params} : {}, ["code", 0]] }
		},

		ordered_list: {
			content: "list_item+",
			group: "block",
			attrs: {order: {default: 1}, tight: {default: false}},
			parseDOM: [{tag: "ol", getAttrs(dom) {
				return {order: dom.hasAttribute("start") ? +dom.getAttribute("start") : 1,
								tight: dom.hasAttribute("data-tight")}
			}}],
			toDOM(node) {
				return ["ol", {start: node.attrs.order == 1 ? null : node.attrs.order,
											 "data-tight": node.attrs.tight ? "true" : null}, 0]
			}
		},

		bullet_list: {
			content: "list_item+",
			group: "block",
			attrs: {tight: {default: false}},
			parseDOM: [{tag: "ul", getAttrs: dom => ({tight: dom.hasAttribute("data-tight")})}],
			toDOM(node) { return ["ul", {"data-tight": node.attrs.tight ? "true" : null}, 0] }
		},

		list_item: {
			content: "paragraph block*",
			defining: true,
			parseDOM: [{tag: "li"}],
			toDOM() { return ["li", 0] }
		},

		text: {
			group: "inline"
		},

		image: {
			inline: true,
			attrs: {
				src: {},
				alt: {default: null},
				title: {default: null}
			},
			group: "inline",
			draggable: true,
			parseDOM: [{tag: "img[src]", getAttrs(dom) {
				return {
					src: dom.getAttribute("src"),
					title: dom.getAttribute("title"),
					alt: dom.getAttribute("alt")
				}
			}}],
			toDOM(node) { return ["img", node.attrs] }
		},

		hard_break: {
			inline: true,
			group: "inline",
			selectable: false,
			parseDOM: [{tag: "br"}],
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
			parseDOM: [{tag: "i"}, {tag: "em"},
								 {style: "font-style", getAttrs: value => value == "italic" && null}],
			toDOM() { return ["em"] }
		},

		strong: {
			parseDOM: [{tag: "b"}, {tag: "strong"},
								 {style: "font-weight", getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null}],
			toDOM() { return ["strong"] }
		},

		link: {
			attrs: {
				href: {},
				title: {default: null}
			},
			inclusive: false,
			parseDOM: [{tag: "a[href]", getAttrs(dom) {
				return {href: dom.getAttribute("href"), title: dom.getAttribute("title")}
			}}],
			toDOM(node) { return ["a", node.attrs] }
		},

		code: {
			inclusive: false,
			parseDOM: [{tag: "code"}],
			toDOM() { return ["code"] }
		},

		underline: {
			inclusive: false,
			parseDOM: [
				{tag: "em.ul"},
				{style: "text-decoration", getAttrs: value => value == "underline" && null }
			],
			toDOM() { return ["em", { class : "ul" }] }
		},

		strike: {
			inclusive: false,
			parseDOM: [
				{tag: "s"},
				{style: "text-decoration", getAttrs: value => value == "line-through" && null }
			],
			toDOM() { return ["s"] }
		},

		wikilink: {
			attrs: {
				href: {},
				title: {default: null}
			},
			inclusive: true,
			parseDOM: [{tag: "a[href].wikilink", getAttrs(dom) {
				return {href: dom.getAttribute("href"), title: dom.getAttribute("title")}
			}}],
			toDOM(node) { return ["a", Object.assign({ class: "wikilink" }, node.attrs)] }
		}
	}
})

function maybeMerge(a, b) {
	if (a.isText && b.isText && Mark.sameSet(a.marks, b.marks))
		return a.withText(a.text + b.text)
}

// Object used to track the context of a running parse.
class MarkdownParseState {
	constructor(schema, tokenHandlers) {
		this.schema = schema
		this.stack = [{type: schema.topNodeType, content: []}]
		this.marks = Mark.none
		this.tokenHandlers = tokenHandlers
	}

	top() {
		return this.stack[this.stack.length - 1]
	}

	push(elt) {
		if (this.stack.length) this.top().content.push(elt)
	}

	// : (string)
	// Adds the given text to the current position in the document,
	// using the current marks as styling.
	addText(text) {
		if (!text) return
		let nodes = this.top().content, last = nodes[nodes.length - 1]
		let node = this.schema.text(text, this.marks), merged
		if (last && (merged = maybeMerge(last, node))) nodes[nodes.length - 1] = merged
		else nodes.push(node)
	}

	// : (Mark)
	// Adds the given mark to the set of active marks.
	openMark(mark) {
		this.marks = mark.addToSet(this.marks)
	}

	// : (Mark)
	// Removes the given mark from the set of active marks.
	closeMark(mark) {
		this.marks = mark.removeFromSet(this.marks)
	}

	parseTokens(toks) {
		console.log(toks);
		for (let i = 0; i < toks.length; i++) {
			let tok = toks[i]
			let tokenType = tok.type;

			// html_inline tokens have a `content` property, storing
			// the html tag as a string like "<div>" or "</div>"
			if(tokenType === "html_inline"){
				// extract tag name
				let match = tok.content.match(/<(\/?)([a-zA-Z\-]+)>/);
				if(!match){ throw new Error("Invalid html_token!", tok.content); }

				// determine open / closed
				let closed = (match[1] === "/") ? true : false;
				tokenType = match[2] + (closed ? "_close" : "_open");
			}
			
			// fetch token handler for this type
			let handler = this.tokenHandlers[tokenType];
			if (!handler) { throw new Error(
				"Token type `" + tokenType + "` not supported by Markdown parser"
			); }

			// handle token
			handler(this, tok)
		}
	}

	// : (NodeType, ?Object, ?[Node]) → ?Node
	// Add a node at the current position.
	addNode(type, attrs, content) {
		let node = type.createAndFill(attrs, content, this.marks)
		if (!node) return null
		this.push(node)
		return node
	}

	// : (NodeType, ?Object)
	// Wrap subsequent content in a node of the given type.
	openNode(type, attrs) {
		this.stack.push({type: type, attrs: attrs, content: []})
	}

	// : () → ?Node
	// Close and return the node that is currently on top of the stack.
	closeNode() {
		if (this.marks.length) this.marks = Mark.none
		let info = this.stack.pop()
		return this.addNode(info.type, info.attrs, info.content)
	}
}

function attrs(spec, token) {
	if (spec.getAttrs) return spec.getAttrs(token)
	// For backwards compatibility when `attrs` is a Function
	else if (spec.attrs instanceof Function) return spec.attrs(token)
	else return spec.attrs
}

// Code content is represented as a single token with a `content`
// property in Markdown-it.
function noOpenClose(type) {
	let tags = [
		"code_inline", "code_block", "fence",
		"math_inline", "math_display"
	];
	return tags.includes(type);
}

function withoutTrailingNewline(str) {
	return str[str.length - 1] == "\n" ? str.slice(0, str.length - 1) : str
}

function noOp() {}

function tokenHandlers(schema, tokens) {
	let handlers = Object.create(null)
	for (let type in tokens) {
		let spec = tokens[type]; 
		
		// some token specs may override html tag
		let tokenType = (spec.html ? spec.html : type);
		
		// define token handlers
		if (spec.block) {
			let nodeType = schema.nodeType(spec.block)
			if (noOpenClose(tokenType)) {
				handlers[tokenType] = (state, tok) => {
					state.openNode(nodeType, attrs(spec, tok))
					state.addText(withoutTrailingNewline(tok.content))
			state.closeNode()
				}
			} else {
				handlers[tokenType + "_open"] = (state, tok) => state.openNode(nodeType, attrs(spec, tok))
				handlers[tokenType + "_close"] = state => state.closeNode()
			}
		} else if (spec.node) {
			let nodeType = schema.nodeType(spec.node)
			handlers[tokenType] = (state, tok) => state.addNode(nodeType, attrs(spec, tok))
		} else if (spec.mark) {
			let markType = schema.marks[spec.mark]
			if (noOpenClose(tokenType)) {
				handlers[tokenType] = (state, tok) => {
					state.openMark(markType.create(attrs(spec, tok)))
					state.addText(withoutTrailingNewline(tok.content))
					state.closeMark(markType)
				}
			} else {
				handlers[tokenType + "_open"] = (state, tok) => state.openMark(markType.create(attrs(spec, tok)))
				handlers[tokenType + "_close"] = state => state.closeMark(markType)
			}
		} else if (spec.ignore) {
			if (noOpenClose(tokenType)) {
				handlers[tokenType] = noOp
			} else {
				handlers[tokenType + '_open'] = noOp
				handlers[tokenType + '_close'] = noOp
			}
		} else {
			throw new RangeError("Unrecognized parsing spec " + JSON.stringify(spec))
		}
	}

	handlers.text = (state, tok) => state.addText(tok.content)
	handlers.inline = (state, tok) => state.parseTokens(tok.children)
	handlers.softbreak = handlers.softbreak || (state => state.addText("\n"))

	console.log("handlers", handlers);
	return handlers
}

// ::- A configuration of a Markdown parser. Such a parser uses
// [markdown-it](https://github.com/markdown-it/markdown-it) to
// tokenize a file, and then runs the custom rules it is given over
// the tokens to create a ProseMirror document tree.
export class MarkdownParser {
	// :: (Schema, MarkdownIt, Object)
	// Create a parser with the given configuration. You can configure
	// the markdown-it parser to parse the dialect you want, and provide
	// a description of the ProseMirror entities those tokens map to in
	// the `tokens` object, which maps token names to descriptions of
	// what to do with them. Such a description is an object, and may
	// have the following properties:
	//
	// **`node`**`: ?string`
	//   : This token maps to a single node, whose type can be looked up
	//     in the schema under the given name. Exactly one of `node`,
	//     `block`, or `mark` must be set.
	//
	// **`block`**`: ?string`
	//   : This token comes in `_open` and `_close` variants (which are
	//     appended to the base token name provides a the object
	//     property), and wraps a block of content. The block should be
	//     wrapped in a node of the type named to by the property's
	//     value.
	//
	// **`mark`**`: ?string`
	//   : This token also comes in `_open` and `_close` variants, but
	//     should add a mark (named by the value) to its content, rather
	//     than wrapping it in a node.
	//
	// **`attrs`**`: ?Object`
	//   : Attributes for the node or mark. When `getAttrs` is provided,
	//     it takes precedence.
	//
	// **`getAttrs`**`: ?(MarkdownToken) → Object`
	//   : A function used to compute the attributes for the node or mark
	//     that takes a [markdown-it
	//     token](https://markdown-it.github.io/markdown-it/#Token) and
	//     returns an attribute object.
	//
	// **`ignore`**`: ?bool`
	//   : When true, ignore content for the matched token.
	constructor(schema, tokenizer, tokens) {
		// :: Object The value of the `tokens` object used to construct
		// this parser. Can be useful to copy and modify to base other
		// parsers on.
		this.tokens = tokens
		this.schema = schema
		this.tokenizer = tokenizer
		this.tokenHandlers = tokenHandlers(schema, tokens)
	}

	// :: (string) → Node
	// Parse a string as [CommonMark](http://commonmark.org/) markup,
	// and create a ProseMirror document as prescribed by this parser's
	// rules.
	parse(text) {
		let state = new MarkdownParseState(this.schema, this.tokenHandlers), doc
		state.parseTokens(this.tokenizer.parse(text, {}))
		do { doc = state.closeNode() } while (state.stack.length)
		return doc
	}
}

// :: MarkdownParser
// A parser parsing unextended [CommonMark](http://commonmark.org/),
// with inline HTML, and producing a document in the basic schema.
let md = markdownit({html:true}).use(
	math_plugin
)

console.log("TEST!!!!", md.render("~~strike~~"));

export const markdownParser = new MarkdownParser(markdownSchema, md, {
	blockquote: {block: "blockquote"},
	paragraph: {block: "paragraph"},
	list_item: {block: "list_item"},
	bullet_list: {block: "bullet_list"},
	ordered_list: {block: "ordered_list", getAttrs: tok => ({order: +tok.attrGet("start") || 1})},
	heading: {block: "heading", getAttrs: tok => ({level: +tok.tag.slice(1)})},
	code_block: {block: "code_block"},
	fence: {block: "code_block", getAttrs: tok => ({params: tok.info || ""})},
	hr: {node: "horizontal_rule"},
	image: {node: "image", getAttrs: tok => ({
		src: tok.attrGet("src"),
		title: tok.attrGet("title") || null,
		alt: tok.children[0] && tok.children[0].content || null
	})},
	hardbreak: {node: "hard_break"},
	s: { mark: "strike" },
	u: { mark: "underline" },
	em: {mark: "em"},
	strong: {mark: "strong"},
	link: {mark: "link", getAttrs: tok => ({
		href: tok.attrGet("href"),
		title: tok.attrGet("title") || null
	})},
	code_inline: {mark: "code"},
	math_inline: { block: "math_inline", getAttrs: tok => ({params: tok.info || ""})},
	math_display: { block: "math_display", getAttrs: tok => ({params: tok.info || ""})}
})