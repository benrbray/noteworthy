'use strict';

import parseLinkLabel from 'markdown-it/lib/helpers/parse_link_label';
import parseLinkTitle from 'markdown-it/lib/helpers/parse_link_title';
import parseLinkDestination from 'markdown-it/lib/helpers/parse_link_destination';
import { normalizeReference } from 'markdown-it/lib/common/utils';
import StateInline from 'markdown-it/lib/rules_inline/state_inline';

function isBlank(code) {
	switch (code) {
		case 0x09/* TAB */:
		case 0x20/* SPACE */:
		case 0x0A/* LF */:
			return true;
	}
	return false;
}

// return pos:
// aaaa  bbb
//       ^
function skipBlanks(src, pos, max) {
	for (; pos < max && isBlank(src.charCodeAt(pos)); ++pos) ;
	return pos;
}

function skipBlanksBack(src, pos, min) {
	for (; min < pos && isBlank(src.charCodeAt(pos - 1)); --pos) ;
	return pos;
}

// follow spec from
// <https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name> (xml attr name)
// i'm lazy of adapting non-ASCII characters (zero width space and so on are toooooo much annoying)
const DIRECTIVE_NAME_RE = /^[a-z][a-z0-9\-_]*/i;
const normalizeDirectiveName = s => s.toLowerCase().replace('_', '-');

// :video[description](https://www.youtube.com/watch?v=0123456789A){.dark #video}
function parseDirectiveName(src, pos, max) {
	// will return null when pos >= max
	const oldPos = pos;
	const rst = src.slice(pos, max).match(DIRECTIVE_NAME_RE);
	if (rst === null) return null;
	pos += rst[0].length;
	return { pos, name: normalizeDirectiveName(src.slice(oldPos, pos)) };
}

function parseLinkDestinationLabel(src, pos, max) {
	if (pos >= max) return null;
	if (src.charCodeAt(pos) !== 0x28/* ( */) return null;

	const dests = [];
	++pos, pos = skipBlanks(src, pos, max);
	for (; pos < max; pos = skipBlanks(src, pos, max)) {
		if (src.charCodeAt(pos) === 0x29/* ) */) {
			++pos;
			return { pos, dests };
		}

		const c = src.charCodeAt(pos);
		if (c === 0x22/* " */ || c === 0x27/* ' */ || c === 0x28/* ( */) {
			// String
			const rst = parseLinkTitle(src, pos, max);
			if (!rst.ok) return null;
			pos = rst.pos;
			dests.push([ 'string', rst.str ]);
		} else {
			// Link
			const rst = parseLinkDestination(src, pos, max);
			if (!rst.ok) return null;
			pos = rst.pos;
			dests.push([ 'link', rst.str ]);
		}

		// there must be a blank between strings and links
		if (pos >= max) return null;
		const charBetween = src.charCodeAt(pos);
		if (!isBlank(charBetween) && charBetween !== 0x29/* ) */) return null;
	}

	return null;
}

// follow spec from
// <https://www.w3.org/TR/xml/#sec-common-syn> (xml attr name)
// reason of not adapting non-ASCII characters are same as DIRECTIVE_NAME_RE's
const ATTR_NAME_RE = /^[a-z][a-z0-9\-_]*/;

function parseAttrName(src, pos, max) {
	// will return null when pos >= max
	const oldPos = pos;
	const rst = src.slice(pos, max).match(ATTR_NAME_RE);
	if (rst === null) return null;
	pos += rst[0].length;
	return { pos, name: src.slice(oldPos, pos) };
}

// base64 as minimum allowed chars
const UNSURROUNDED_STRING_RE = /^[a-z0-9\-_]+/i;

function parseUnsurroundedName(src, pos, max) {
	// will return null when pos >= max
	const oldPos = pos;
	const rst = src.slice(pos, max).match(UNSURROUNDED_STRING_RE);
	if (rst === null) return null;
	pos += rst[0].length;
	return { pos, name: src.slice(oldPos, pos) };
}

function parseAttrLabel(src, pos, max) {
	if (pos >= max) return null;
	if (src.charCodeAt(pos) !== 0x7B/* { */) return null;

	const attrs = {};
	++pos, pos = skipBlanks(src, pos, max);
	for (; pos < max; pos = skipBlanks(src, pos, max)) {
		if (src.charCodeAt(pos) === 0x7D/* } */) {
			++pos;

			for (const key in attrs) {
				if (attrs[key].length === 1) attrs[key] = attrs[key][0];
			}

			return { pos, attrs };
		}

		const c = src.charCodeAt(pos);
		if (c === 0x23/* # */) {
			// id
			++pos;
			const rst = parseUnsurroundedName(src, pos, max);
			if (rst === null) return null;
			pos = rst.pos;
			const key = 'id', value = rst.name;
			if (typeof attrs[key] === 'undefined') {
				attrs[key] = [ value ];
			} else {
				attrs[key].push(value);
			}
		} else if (c === 0x2E/* . */) {
			// class
			++pos;
			const rst = parseUnsurroundedName(src, pos, max);
			if (rst === null) return null;
			pos = rst.pos;
			// store
			const key = 'class', value = rst.name;
			if (typeof attrs[key] === 'undefined') {
				attrs[key] = [ value ];
			} else {
				attrs[key].push(value);
			}
		} else {
			// normal attrs
			// key
			let rst = parseAttrName(src, pos, max);
			if (rst === null) return null;
			const key = rst.name;
			pos = rst.pos, pos = skipBlanks(src, pos, max);
			// =
			if (pos >= max) return null;
			if (src.charCodeAt(pos) !== 0x3D/* = */) return null;
			++pos, pos = skipBlanks(src, pos, max);
			// value
			if (pos >= max) return null;
			let value;
			const c = src.charCodeAt(pos);
			if (c === 0x22/* " */ || c === 0x27/* ' */) {
				rst = parseLinkTitle(src, pos, max);
				if (!rst.ok) return null;
				value = rst.str;
				pos = rst.pos;
			} else {
				rst = parseUnsurroundedName(src, pos, max);
				if (rst === null) return null;
				value = rst.name;
				pos = rst.pos;
			}
			// store
			if (typeof attrs[key] === 'undefined') {
				attrs[key] = [ value ];
			} else {
				attrs[key].push(value);
			}
		}

		// there must be a blank between attrs
		if (pos >= max) return null;
		const charBetween = src.charCodeAt(pos);
		if (!isBlank(charBetween) && charBetween !== 0x7D/* } */) return null;
	}

	return null;
}

function parseDirective(state, src, pos, max, allowSpaceBetween) {
	const md = state.md;

	// Directive name (required)
	const nameResult = parseDirectiveName(src, pos, max);
	// parser failed to find directive name, so it's not a valid directive
	if (nameResult === null) return null;
	const name = nameResult.name;
	pos = nameResult.pos;
	if (allowSpaceBetween) pos = skipBlanks(src, pos, max);

	// Link text (optional)
	const labelStart = pos,
				labelEnd = parseLinkLabel(state, labelStart);
	let content;
	let contentStart, contentEnd;
	if (labelEnd >= 0) {
		content = src.slice(pos + 1, labelEnd);
		pos = labelEnd + 1;
		contentStart = labelStart + 1;
		contentEnd = labelEnd;
	}
	if (allowSpaceBetween) pos = skipBlanks(src, pos, max);

	// Link destinations (optional)
	const destsStart = pos;
	const destsResult = parseLinkDestinationLabel(src, destsStart, max);
	let dests;
	if (destsResult !== null) {
		dests = destsResult.dests;
		pos = destsResult.pos;
	} else if (typeof state.env.references !== 'undefined') {
		// Reference mode
		const destsEnd = parseLinkLabel(state, destsStart);
		if (destsEnd >= 0) {
			const refText = src.slice(destsStart + 1, destsEnd);
			const ref = state.env.references[normalizeReference(refText)];
			if (ref) {
				dests = [ [ 'link', ref.href ], [ 'string', ref.title ] ];
				pos = destsEnd + 1;
			}
		} else {
			const ref = state.env.references[normalizeReference(content)];
			if (ref) {
				dests = [ [ 'link', ref.href ], [ 'string', ref.title ] ];
			}
		}
	}
	if (allowSpaceBetween) pos = skipBlanks(src, pos, max);

	// Parse attributes (optional)
	const attrsResult = parseAttrLabel(src, pos, max);
	let attrs;
	if (attrsResult !== null) {
		attrs = attrsResult.attrs;
		pos = attrsResult.pos;
	}
	if (allowSpaceBetween) pos = skipBlanks(src, pos, max);

	return { directiveName: name, content, dests, attrs, contentStart, contentEnd, pos }
}

function inlineDirectiveRule(state, silent) {
	const md = state.md, src = state.src;

	const max = state.posMax;
	let pos = state.pos;
	if (src.charCodeAt(pos) !== 0x3A/* : */) return false;
	++pos;

	const rst = parseDirective(state, src, pos, max, false);
	if (rst === null) return false;
	const { directiveName, content, dests, attrs, contentStart, contentEnd } = rst;
	const handler = md.inlineDirectives[directiveName];
	// parser failed to find correspond directive name, so it's not a valid directive
	if (typeof handler === 'undefined') return false;
	pos = rst.pos;

	// Tokenlize
	if (!silent) {
		// markdown-it uses escape rule to unescape content in `[text]`,
		// and use unescapeAll function to unescape content in `"title"`.
		//
		// Directive handler needs to use unescapeAll manually
		// since different plugins have different demands
		// (some treat the content as markdown and continue to parse it,
		// others treat the content as text so they need to unescape it).
		//
		// Markdown's design that paired `[]` doesn't need to be escaped
		// avoids "escape melaleuca" like `[\[\\[\\]\]]`. Clever design.
		handler(state, content, dests, attrs, contentStart, contentEnd, state.pos, pos);
	}

	state.pos = pos;
	return true;
}

function findNextLine(src, startLine, endLine, state) {
	let line = startLine + 1;
	let level = 1;
	for (; line < endLine && level !== 0; ++line) {
		const max = state.eMarks[line];
		let pos = state.bMarks[line] + state.tShift[line];
		let pos2 = state.skipChars(pos, 0x3A);
		if (pos2 - pos < 3) continue; // not a start mark or a close mark
		if (pos2 === max) {
			// close mark
			--level;
		} else {
			// open mark
			++level;
		}
	}
	if (level !== 0) return -1; // cannot find matched close mark (:::)
	return line;
}

function blockDirectiveRule(state, startLine, endLine, silent) {
	const md = state.md, src = state.src;

	const max = state.eMarks[startLine];
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	if (pos + 3 > max // eMark point to the char after LF and no possible of a two char line (::\n which is not valid)
	 || src.charCodeAt(pos) !== 0x3A/* : */
	 || src.charCodeAt(pos + 1) !== 0x3A/* : */
	) {
		return false
	}
	pos += 2;

	// detect if one line mode and skip to directive name
	let oneLine = false;
	if (src.charCodeAt(pos) !== 0x3A/* : */) {
		oneLine = true;
	} else {
		pos = state.skipChars(pos, 0x3A/* : */);
	}
	pos = skipBlanks(src, pos, max);

	// parseLinkLabel need a StateInline state instead of StateBlock state
	// which don't have a skipToken method
	const inlineState = new StateInline(src, md, state.env, {});
	const rst = parseDirective(inlineState, src, pos, max, true);
	if (rst === null) return false;
	const { directiveName, content: inlineContent, dests, attrs, contentStart: inlineContentStart, contentEnd: inlineContentEnd } = rst;
	const handler = md.blockDirectives[directiveName];
	console.log("USING BLOCK HANDLER", handler, directiveName, "\n\n\n\n\n\n");
	// parser failed to find correspond directive name, so it's not a valid directive
	if (typeof handler === 'undefined') return false;
	pos = rst.pos;

	// :::: hello [] () {} comment ::::
	//                     ~~~~~~~
	const contentTitleStart = pos;
	let posEnd = skipBlanksBack(src, max, pos);
	let tmp = state.skipCharsBack(posEnd, 0x3A/* : */, pos);
	// :: name [](){}  next thing:
	//                 ~~~~~~~~~~~
	if (posEnd - tmp > 1) posEnd = tmp;
	const contentTitleEnd = skipBlanksBack(src, posEnd, pos);
	const contentTitle = src.slice(contentTitleStart, contentTitleEnd);

	if (oneLine) {
		// Tokenlize
		if (!silent) {
			handler(
				state, undefined, contentTitle, inlineContent, dests, attrs,
				undefined, undefined,
				contentTitleStart, contentTitleEnd,
				inlineContentStart, inlineContentEnd,
				startLine, startLine + 1
			);
		}

		state.line = startLine + 1;
		return true;
	}

	const nextLine = findNextLine(src, startLine, endLine, state);
	if (nextLine === -1) return false; // cannot find matched close mark (:::)
	const content = state.getLines(startLine + 1, nextLine - 1, state.sCount[startLine], true);
	if (!silent) {
		handler(
			state, content, contentTitle, inlineContent, dests, attrs,
			startLine + 1, nextLine - 1,
			contentTitleStart, contentTitleEnd,
			inlineContentStart, inlineContentEnd,
			startLine, nextLine
		);
	}

	state.line = nextLine;
	return true;
}

function load(md, options) {
	if (md.inlineDirectives) return;

	console.log("LOADING DIRECTIVE PLUGIN!!!\n\n\n\n\n");

	// init
	md.inlineDirectives = options.inlineDirectives || {}
	md.blockDirectives = options.blockDirectives || {}

	console.log(md.inlineDirectives);

	md.inline.ruler.push('inline_directive', inlineDirectiveRule);
	md.block.ruler.before('paragraph', 'block_directive', blockDirectiveRule);
}

export default load;