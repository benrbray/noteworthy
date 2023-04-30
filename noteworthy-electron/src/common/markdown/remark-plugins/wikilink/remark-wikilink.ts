// https://github.com/landakram/remark-wiki-link

import { syntax } from 'micromark-extension-wiki-link';
import { fromMarkdown, toMarkdown } from './mdast-util-wikilink';

let warningIssued: boolean = false;

function wikiLinkPlugin (this:any, opts = {}): any {
  const data = this.data()

  function add (field:string, value:unknown) {
    if (data[field]) data[field].push(value)
    else data[field] = [value]
  }

  if (!warningIssued &&
      ((this.Parser &&
        this.Parser.prototype &&
        this.Parser.prototype.blockTokenizers) ||
       (this.Compiler &&
        this.Compiler.prototype &&
        this.Compiler.prototype.visitors))) {
    warningIssued = true
    console.warn(
      '[remark-wiki-link] Warning: please upgrade to remark 13 to use this plugin'
    )
  }

  add('micromarkExtensions', syntax(opts))
  add('fromMarkdownExtensions', fromMarkdown(opts))
  add('toMarkdownExtensions', toMarkdown(opts))
}

export { wikiLinkPlugin }