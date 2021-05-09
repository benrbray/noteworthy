import { EditorConfig } from "./editor-config";
import {
	BlockQuoteExtension, HeadingExtension, HorizontalRuleExtension,
	CodeBlockExtension, /*OrderedListExtension, UnorderedListExtension,*/
	/*ListItemExtension,*/ ImageExtension, HardBreakExtension, InlineMathExtension,
	BlockMathExtension, /*RegionExtension, EmbedExtension,*/ ParagraphExtension,
	CitationExtension
} from "./node-extensions";
import {
	BoldExtension, ItalicExtension, CodeExtension, LinkExtension,
	//UnderlineExtension, DefinitionExtension, StrikethroughExtension,
	WikilinkExtension,
	//TagExtension
} from "./mark-extensions";

////////////////////////////////////////////////////////////

let paragraphExt: ParagraphExtension;

/** @todo revisit default parser -- is this the best way?
 * currently, workspaces rely on this object for all
 * behind-the-scenes parsing (e.g. when file is added/changed) */
export const defaultMarkdownConfig = new EditorConfig([
	// nodes: formatting
	(paragraphExt = new ParagraphExtension()),
	new BlockQuoteExtension(),
	new HeadingExtension(paragraphExt),
	new HorizontalRuleExtension(),
	new CodeBlockExtension(),
	// new OrderedListExtension(),
	// new UnorderedListExtension(),
	// new ListItemExtension(),
	new ImageExtension(),
	new HardBreakExtension(),
	// nodes: math
	new InlineMathExtension(),
	new BlockMathExtension(),
	// nodes: special
	// new RegionExtension(),
	// new EmbedExtension(),
	// marks
	new BoldExtension(),
	new ItalicExtension(),
	//new DefinitionExtension(),
	new LinkExtension(),
	//new UnderlineExtension(),
	new CodeExtension(),
	//new StrikethroughExtension(),
	// plugins: crossrefs
	new WikilinkExtension(),
	//new TagExtension(),
	new CitationExtension()
], [], { });