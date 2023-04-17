/**
 * Adapted from `prosemirror-inputrules` package.
 * https://github.com/ProseMirror/prosemirror-inputrules/blob/master/src/inputrules.ts
 */

import * as PI from "prosemirror-inputrules";
import * as PV from "prosemirror-view";
import * as PS from "prosemirror-state";

////////////////////////////////////////////////////////////

/** Create an input rules plugin. When enabled, it will cause text
 * input that matches any of the given rules to trigger the rule's
 * action.
 * 
 * (unchanged from prosemirror-inputrules except for handleKeyDown)
 */
export function makeInputRulePlugin({rules}: {rules: readonly PI.InputRule[]}) {
	let plugin: PS.Plugin<{transform: PS.Transaction, from: number, to: number, text: string} | null> = new PS.Plugin({
		state: {
			init() { return null },
			apply(this: typeof plugin, tr, prev) {
				let stored = tr.getMeta(this)
				if (stored) return stored
				return tr.selectionSet || tr.docChanged ? null : prev
			}
		},

		props: {
			handleTextInput(view, from, to, text) {
				return run(view, from, to, text, rules, plugin)
			},
			handleDOMEvents: {
				compositionend: (view) => {
					setTimeout(() => {
						let {$cursor} = view.state.selection as PS.TextSelection
						if ($cursor) run(view, $cursor.pos, $cursor.pos, "", rules, plugin)
					})

					// resolve type error
					// https://discuss.prosemirror.net/t/settimeout-in-inputrule-compositionend/3238
					return false;
				}
			},
			// extend input rule regexes with the ability to handle newlines 
			// https://discuss.prosemirror.net/t/trigger-inputrule-on-enter/1118/5
      handleKeyDown(view, event) {
        if (event.key !== "Enter") return false;
        let {$cursor} = view.state.selection as PS.TextSelection
        if ($cursor) return run(view, $cursor.pos, $cursor.pos, "\n", rules, plugin)
        return false;
      }
		},

		// TODO (Ben @ 2023/04/04) revisit this ignore once https://github.com/benrbray/noteworthy/issues/31
		// @ts-ignore ts(2345) can only assign known properties
		isInputRules: true
	})

	plugin.props

	return plugin
}

const MAX_MATCH = 500;

// TODO (Ben @ 2023/04/04) this type definition is needed to expose internal fields,
// revisit this casting once https://github.com/benrbray/noteworthy/issues/31 is resolved
type InputRuleInternal = PI.InputRule & {
	match : RegExp;
	handler: (state: PS.EditorState, match: RegExpMatchArray, start: number, end: number) => PS.Transaction | null;
}

// unchanged from prosemirror-inputrules, except for types
function run(view: PV.EditorView, from: number, to: number, text: string, rules: readonly PI.InputRule[], plugin: PS.Plugin) {
	if (view.composing) return false
	let state = view.state, $from = state.doc.resolve(from)
	if ($from.parent.type.spec.code) return false
	let textBefore =
		$from.parent.textBetween(
			Math.max(0, $from.parentOffset - MAX_MATCH),
			$from.parentOffset,
			undefined,
			"\ufffc"
		) + text;

	// expose internal fields
	const rulesInternal = rules as InputRuleInternal[];
	
	for (let i = 0; i < rulesInternal.length; i++) {
		let match = rulesInternal[i].match.exec(textBefore)
		let tr = match && rulesInternal[i].handler(state, match, from - (match[0].length - text.length), to)
		if (!tr) continue
		view.dispatch(tr.setMeta(plugin, {transform: tr, from, to, text}))
		return true
	}
	return false
}