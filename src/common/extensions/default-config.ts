import { EditorConfig } from "./editor-config";
import { BlockQuoteExtension, HeadingExtension, HorizontalRuleExtension, CodeBlockExtension, OrderedListExtension, UnorderedListExtension, ListItemExtension, ImageExtension, HardBreakExtension, InlineMathExtension, BlockMathExtension, RegionExtension, EmbedExtension } from "./node-extensions";
import { BoldExtension, ItalicExtension, DefinitionExtension, LinkExtension, UnderlineExtension, CodeExtension, StrikethroughExtension, WikilinkExtension, TagExtension, CitationExtension } from "./mark-extensions";

////////////////////////////////////////////////////////////

/** @todo revisit default parser -- is this the best way?
 * currently, workspaces rely on this object for all
 * behind-the-scenes parsing (e.g. when file is added/changed) */
export const defaultMarkdownConfig = new EditorConfig([
	// nodes: formatting
	new BlockQuoteExtension(),
	new HeadingExtension(),
	new HorizontalRuleExtension(),
	new CodeBlockExtension(),
	new OrderedListExtension(),
	new UnorderedListExtension(),
	new ListItemExtension(),
	new ImageExtension(),
	new HardBreakExtension(),
	// nodes: math
	new InlineMathExtension(),
	new BlockMathExtension(),
	// nodes: special
	new RegionExtension(),
	new EmbedExtension(),
	// marks
	new BoldExtension(),
	new ItalicExtension(),
	new DefinitionExtension(),
	new LinkExtension(),
	new UnderlineExtension(),
	new CodeExtension(),
	new StrikethroughExtension(),
	new WikilinkExtension(),
	new TagExtension(),
	new CitationExtension()
], [], { });