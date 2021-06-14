// testing
import * as assert from 'assert';

// misc
import dedent from "dedent-js";

// noteworthy
import { defaultMarkdownConfig } from "../../src/common/doctypes/markdown-doc"

////////////////////////////////////////////////////////////

export interface TestCase<Opts={}> {
	description?: string;
	options?: Partial<Opts>;
}

export interface TestRoundtrip extends TestCase {
	markdown: string;  // markdown input
	expected?: string; // if undefined, output should match input
}

export interface TestSuite<T extends TestCase<any>> {
	/** Default options for the entire test suite.  Can be overridden by individual cases. */
	options?: T extends TestCase<infer O> ? O : never;
	cases: T[],
}

////////////////////////////////////////////////////////////

export const roundtripCases:TestRoundtrip[] = [
	// empty file
	{ markdown: "" },
	// strong / emphasis
	{ markdown: "***bold italic***" },
	{ markdown: "**bold *italic***" },
	{ markdown: "***bold** italic*" },
	// blockquote
	{ markdown: '> this is a blockquote\n> and a second line' },
	{ markdown: '> this is a blockquote\n\n> and a separate one' },
	// heading
	{ markdown: '# heading' },
	{ markdown: '## heading' },
	{ markdown: '### heading' },
	{ markdown: '#### heading' },
	{ markdown: '##### heading' },
	{ markdown: '###### heading' },
	// hrule
	{ markdown: '***' },
	{ markdown: '---' },
	{ markdown: '___' },
	{ markdown: '******' },
	{ markdown: '- -- - -- - -- - -- - --' },
	{ markdown: '_	_	     _ _ _ _' },
	// code block
	{ markdown: dedent`
		\`\`\`
		this is
		a code block
		\`\`\`
		`
	},{
		markdown: '    this is\n    a code block\n',
		expected: '```\nthis is\na code block\n```'
	},
	// code inline
	{ markdown: 'begin `inline code` end' },
	{ markdown: 'begin `inl*ine* code` end' },
	{ markdown: 'begin `inl**ine** code` end' },
	// link
	{ markdown: 'begin [Hacker News](https://news.ycombinator.com/) end' },
	// wikilink
	{ markdown: 'begin [[wadler1989]] end' },
	{ markdown: 'begin [[wad*ler19*89]] end', expected: "begin [[wad\\*ler19\\*89]] end" },
	{ markdown: 'begin [[wad**ler19**89]] end', expected: "begin [[wad\\*\\*ler19\\*\\*89]] end" },
	// citation
	{ markdown: 'begin @[wadler1989] end' },
	{ markdown: 'begin [@wadler1989] end' },
	{ markdown: 'begin [see @wadler1989; and @hughes2003] end' },
	{ markdown: 'begin @[wadler1989; and @hughes2003] end' },
	// image
	{ markdown: '![alt image text](https://news.ycombinator.com/)' },
	// math block
	{ markdown: 'consider the equation\n\n$$\n\\int_a^b f(x) dx\n$$\n\nwhich follows from' },
	// math inline
	{ markdown: 'consider a function $f : \\mathbb{R^*} \\rightarrow \\mathbb{R}$ given by $x \\mapsto 2*x$' },
	// table (currently unsupported, but should be preserved with an error block)
	{ markdown: dedent`
		| Syntax      | Description |
		| ----------- | ----------- |
		| Header      | Title       |
		| Paragraph   | Text        |
		`
	},
	// unordered list
	{ markdown: dedent`
		+ apple
		+ banana
		+ cherry
		`
	},{ markdown: dedent`
		* apple
		* banana
		* cherry
		`
	},{ markdown: dedent`
		- apple

		- banana
		  * cavendish
		  * gros michel

		- cherry
		`
	},{ markdown: dedent`
		- item1
		- item2
		- item3
		  + sub1
		    * subsub1
		    * subsub2
		  + sub2
		  + sub3
		- item4
		- item5
		`
	},{ markdown: dedent`
		* **Fruit I:** apple
		* *Fruit II:* banana
		* ***Fruit III:*** cherry
		`
	},
	// ordered list
	{ markdown: dedent`
		1. apple
		2. banana
		3. cherry
		`
	},
	// yaml
	{ markdown: dedent`
		---
		title: Beautiful Concurrency
		author:
		  - name: Simon Peyton-Jones
		date: 2007
		---
		`
	},
	// directives
	{ markdown: dedent`
		:::theorem
		water is wet
		:::
		`
	},
	{ markdown: dedent`
		:::theorem[this is a label]
		water is wet
		:::
		`
	},
	{ markdown: dedent`
		:::theorem{#id}
		water is wet
		:::
		`
	},
	{ markdown: dedent`
		:::theorem{#id key1="val1" key2="val2"}
		water is wet
		:::
		`
	},
	// note: remark-directive puts no space between classes when serializing
	{ markdown: dedent`
		:::theorem{#id .class1.class2}
		water is wet
		:::
		`
	}
]

export const roundtripSuite: TestSuite<TestRoundtrip> = {
	cases: roundtripCases
}

////////////////////////////////////////////////////////////

function runTestSuite<T extends TestCase<O>, O = unknown>(
	contextMsg: string,
	descPrefix: string,
	testSuite: TestSuite<T>,
	testRunner: (test: T, options: O) => void
): void {
	context(contextMsg, () => {
		let idx = 0;
		for(let testCase of testSuite.cases) {
			let desc = `[${descPrefix} ${("00" + (++idx)).slice(-3)}] ` + (testCase.description || "");
			it(desc, () => {
				// merge suite options with case options
				const options: O = Object.assign({}, testSuite.options, testCase.options);
				// run the test
				testRunner(testCase, options);
			});
		}
	});
}

function runTestSuite_roundtrip(contextMsg: string, descPrefix:string, testSuite: TestSuite<TestRoundtrip>): void {
	return runTestSuite(contextMsg, descPrefix, testSuite, (testCase, options) => {
		// parse (markdown -> prosemirror)
		let doc = defaultMarkdownConfig.parse(testCase.markdown);
		if(!doc) { assert.fail("received null document"); }
		// serialize (prosemirror -> markdown)
		let serialized = defaultMarkdownConfig.serialize(doc);
		if(serialized === null) { assert.fail("serialization error"); }
		
		// compare
		if(testCase.expected === undefined) {
			assert.strictEqual(serialized.trim(), testCase.markdown);
		} else {
			assert.strictEqual(serialized.trim(), testCase.expected);
		}
	});
}

////////////////////////////////////////////////////////////

// from markdown
describe('markdown syntax', () => {

	runTestSuite_roundtrip("roundtrip", "roundtrip", roundtripSuite);

});