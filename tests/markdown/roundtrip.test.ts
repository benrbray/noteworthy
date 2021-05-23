// // testing
import * as assert from 'assert';

// mdast / unist
import * as Uni from "unist";
import fromMarkdown from 'mdast-util-from-markdown';
import toMarkdown from 'mdast-util-to-markdown';

// noteworthy
import { makeParser } from "../../src/common/markdown/mdast2prose";
import { makeSerializer } from "../../src/common/markdown/prose2mdast";
import { defaultMarkdownConfig } from "../../src/common/extensions/default-config"

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
	// heading
	{ markdown: '# heading' },
	{ markdown: '## heading' },
	{ markdown: '### heading' },
	{ markdown: '#### heading' },
	{ markdown: '##### heading' },
	{ markdown: '###### heading' },
	// link
	{ markdown: 'begin [Hacker News](https://news.ycombinator.com/) end' },
	// wikilink
	{ markdown: 'begin [[wadler1989]] end' },
	{ markdown: 'begin [[wad*ler19*89]] end', expected: "begin [[wad\\*ler19\\*89]] end" },
	{ markdown: 'begin [[wad**ler19**89]] end', expected: "begin [[wad\\*\\*ler19\\*\\*89]] end" },
	// citation
	{ markdown: 'begin @[wadler1989] end' },
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
	// create parser

	// create serializer
	
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