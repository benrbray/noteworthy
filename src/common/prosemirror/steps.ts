// prosemirror imports
import { Step, StepResult } from "prosemirror-transform";
import { Node as ProseNode, Schema as ProseSchema } from "prosemirror-model";

export class SetDocAttrStep<T=unknown> extends Step {

	prevValue?: T;

	/**
	 * A Step representing a change to the attrs of a ProseMirror document.
	 * As of (7/25/20), This is not possible without a custom Step.  See:
	 * https://discuss.prosemirror.net/t/changing-doc-attrs/784
	 */
	constructor(public key: string, public value: T, public stepType: string = 'SetDocAttr') {
		super();
	}

	apply(doc:ProseNode) {
		this.prevValue = doc.attrs[this.key];
		/** @todo (7/26/19) re-apply this fix if defaultAttrs needed */
		//if (doc.attrs == doc.type.defaultAttrs) doc.attrs = Object.assign({}, doc.attrs);

		// TODO (Ben @ 2023/04/30) doc.attrs is read-only, create new doc instead
		// @ts-ignore
		doc.attrs[this.key] = this.value;

		return StepResult.ok(doc);
	}
	
	invert() {
		return new SetDocAttrStep(this.key, this.prevValue, 'revertSetDocAttr');
	}

	map() {
		/** @todo (7/26/20) is returning null the desired behavior? */
		return null;
	}

	toJSON() {
		return {
			stepType: this.stepType,
			key: this.key,
			value: this.value,
		};
	}
	
	static fromJSON<T = unknown>(schema:ProseSchema, json:{ key : string, value: T, stepType: string }) {
		return new SetDocAttrStep<T>(json.key, json.value, json.stepType);
	}
}