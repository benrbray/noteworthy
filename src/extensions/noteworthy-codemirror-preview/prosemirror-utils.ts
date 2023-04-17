// prosemirror
import * as PM from "prosemirror-model";
import * as PT from "prosemirror-transform";

////////////////////////////////////////////////////////////////////////////////

/// Update an attribute in a specific node.
// TODO (Ben @ 2023/04/04) delete this and import from prosemirror-transform
// after resolving https://github.com/benrbray/noteworthy/issues/31
export class AttrStep extends PT.Step {
  /// Construct an attribute step.
  constructor(
    /** position of the target node */
    readonly pos: number,
    /** attribute to set */
    readonly attr: string,
    /** attribute's new value */
    readonly value: any
  ) {
    super()
  }

  apply(doc: PM.Node) {
    let node = doc.nodeAt(this.pos)
    if (!node) return PT.StepResult.fail("No node at attribute step's position")
    let attrs = Object.create(null)
    for (let name in node.attrs) attrs[name] = node.attrs[name]
    attrs[this.attr] = this.value
    let updated = node.type.create(attrs, undefined, node.marks)
    return PT.StepResult.fromReplace(doc, this.pos, this.pos + 1, new PM.Slice(PM.Fragment.from(updated), 0, node.isLeaf ? 0 : 1))
  }

  getMap() {
    return new PT.StepMap([]);
  }

  invert(doc: PM.Node) {
    return new AttrStep(this.pos, this.attr, doc.nodeAt(this.pos)!.attrs[this.attr])
  }

  map(mapping: PT.Mappable) {
    let pos = mapping.mapResult(this.pos, 1)
    return pos.deleted ? null : new AttrStep(pos.pos, this.attr, this.value)
  }

  toJSON(): any {
    return {stepType: "attr", pos: this.pos, attr: this.attr, value: this.value}
  }

  static fromJSON(schema: PM.Schema, json: any) {
    if (typeof json.pos != "number" || typeof json.attr != "string")
      throw new RangeError("Invalid input for AttrStep.fromJSON")
    return new AttrStep(json.pos, json.attr, json.value)
  }
}

PT.Step.jsonID("attr", AttrStep)