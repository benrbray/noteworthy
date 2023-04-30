/**
 * A Remark plugin which transforms the AST to remove paragraph wrappers around
 * images, whenever the image is the only content in its paragraph.
 *
 * Useful for distinguishing between block and inline images.
 *
 * (Note: This behavior is non-standard.  CommonMark has only inline images.)
 *
 * Adapted from remark-unwrap-image by wooorm:
 * https://github.com/remarkjs/remark-unwrap-images
 */

// unist / remark / mdast / micromark
import * as Uni from "unist";
import unified from "unified";

// noteworthy
import { visitTransformNodeType, whitespace, VisitorAction } from "@common/markdown/unist-utils";
import * as Md from "@common/markdown/markdown-ast";

////////////////////////////////////////////////////////////

export const remarkUnwrapImagePlugin: unified.Attacher<void[]> = (proc) => {
  return (tree: Uni.Node) => {
    visitTransformNodeType<Md.Paragraph>(tree, 'paragraph', (node: Md.Paragraph, index: number, parent: Uni.Parent|null) => {
      if (
        parent &&
        typeof index === 'number' &&
        containsImage(node) === CONTAINS_IMAGE
      ) {
        parent.children.splice(index, 1, ...node.children)
        return { action: VisitorAction.SKIP, continueFrom: index }
      }

	  return { action: VisitorAction.CONTINUE }
    })
  }
}

const UNKNOWN = 1;
const CONTAINS_IMAGE = 2;
const CONTAINS_OTHER = 3;

/**
 * @param {Paragraph} node
 * @param {boolean} [inLink]
 * @returns {1|2|3}
 */
function containsImage(node: Md.Paragraph): 1|2|3 {
  let result: 1|2|3 = UNKNOWN;
  let index = -1

  while (++index < node.children.length) {
    const child = node.children[index]

    if (whitespace(child)) {
      // White space is fine.
    } else if (child.type === 'image' || child.type === 'imageReference') {
      result = CONTAINS_IMAGE;
    } else {
      return CONTAINS_OTHER;
    }
  }

  return result
}