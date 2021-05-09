/* markdown-it-wikilinks */

/** @todo (7/29/20) support extended syntax
 * [[link|label]]
 * [[/link]]
 * https://github.com/jsepia/markdown-it-wikilinks
 */

// markdown-it imports
import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token.js";
import { RenderRule } from "markdown-it/lib/renderer.js";
import { RuleInline } from "markdown-it/lib/parser_inline.js";
import StateInline from "markdown-it/lib/rules_inline/state_inline.js";

////////////////////////////////////////////////////////////

// Test if potential opening or closing delimieter
// Assumes that there is a "[[" at state.src[pos]
function isValidDelim(state:StateInline, pos:number) {
	var prevChar, nextChar,
		max = state.posMax,
		can_open = true,
		can_close = true;

	prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
	nextChar = pos + 2 <= max ? state.src.charCodeAt(pos + 2) : -1;

	// Check non-whitespace conditions for opening and closing
	if (prevChar === 0x20/* " " */ || prevChar === 0x09/* \t */) {
		can_close = false;
	}
	if (nextChar === 0x20/* " " */ || nextChar === 0x09/* \t */) {
		can_open = false;
	}

	return {
		can_open: can_open,
		can_close: can_close
	};
}

const wikilink_rule:RuleInline = (state:StateInline, silent:boolean) => {
	var start, match, token, res, esc_count;
	let pos:number = state.pos;
	let max:number = state.posMax;

	if (pos + 2 > max)  { return false; }

	let slice = state.src.slice(pos, pos+2);

	let is_open:boolean  = (slice == "[[");
	if(!is_open){ return false; }

	res = isValidDelim(state, state.pos);
	if (!res.can_open) {
		if (!silent) { state.pending += "[["; }
		state.pos += 2;
		return true;
	}

	// First check for and bypass all properly escaped delimieters
	// This loop will assume that the first leading backtick can not
	// be the first character in state.src, which is known since
	// we have found an opening delimieter already.
	start = state.pos + 2;
	match = start;
	while ((match = state.src.indexOf("]]", match)) !== -1) {
		// Found potential ]], look for escapes, pos will point to
		// first non escape when complete
		pos = match - 1;
		while (state.src[pos] === "\\") { pos -= 1; }

		// Even number of escapes, potential closing delimiter found
		if (((match - pos) % 2) == 1) { break; }
		match += 2;
	}

	// No closing delimter found.  Consume [[ and continue.
	if (match === -1) {
		if (!silent) { state.pending += "[["; }
		state.pos = start;
		return true;
	}

	// Check if we have empty content, ie: [[]].  Do not parse.
	if (match - start === 0) {
		if (!silent) { state.pending += "[[]]"; }
		state.pos = start + 2;
		return true;
	}

	// Check for valid closing delimiter
	res = isValidDelim(state, match);
	if (!res.can_close) {
		if (!silent) { state.pending += "[["; }
		state.pos = start;
		return true;
	}

	if (!silent) {
		token = state.push('wikilink', 'wikilink', 0);
		token.markup = "[[";
		token.content = state.src.slice(start, match);
	}

	state.pos = match + 2;
	return true;
}

export const wikilinks_plugin:MarkdownIt.PluginWithOptions = (md:MarkdownIt) => {

	// Inline Renderer -------------------------------------

	const inlineRenderer:RenderRule = (tokens:Token[], idx:number) => {
		return tokens[idx].content;
	};
	md.inline.ruler.after('escape', 'wikilink', wikilink_rule);
	md.renderer.rules.wikilink = inlineRenderer;
}