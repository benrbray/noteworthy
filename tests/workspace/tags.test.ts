// testing
import FSALMock, { MockFile } from '../mocks/fsal-mock';
import * as assert from 'assert';

// misc
import dedent from "dedent-js";
import YAML from "yaml";

// noteworthy
import { WorkspaceService } from "@main/workspace/workspace-service";
import { PluginService } from "@main/plugins/plugin-service";
import { IDirEntryMeta, IFileMeta } from '@common/files';

////////////////////////////////////////////////////////////

export interface TestCase<Opts={}> {
	description?: string;
	options?: Partial<Opts>;
}

export interface TestFile {
	path       : string,
	yaml?      : { tags?: string[], tags_defined?: string[] }
	bodyTags? : string[],
	bodyText? : string,
}

export type ExpectTags = {
	// note: when running the test, `uses` will be
	// the union of `uses` and `defs`
	[tag:string] : { defs : string[], uses: string [] }
}

export interface TestWorkspaceTags extends TestCase {
	initialFiles: TestFile[],
	actions : TestAction[]
}

export interface TestSuite<T extends TestCase<any>> {
	/** Default options for the entire test suite.  Can be overridden by individual cases. */
	options?: T extends TestCase<infer O> ? O : never;
	cases: T[],
}

export interface TestActionSave { action: "save", file: TestFile };
export interface TestActionDelete { action: "delete", path: string };
export interface TestActionCompareTags { action: "compareTags", expectTags: ExpectTags };

export type TestAction
	= TestActionSave
	| TestActionDelete
	| TestActionCompareTags

////////////////////////////////////////////////////////////

let testWorkspaceTagsCases: TestWorkspaceTags[] = [];

testWorkspaceTagsCases.push({
	initialFiles : [
		{ path: "ab/aaaa.md" },
		{ path: "ab/bbbb.md", yaml: { tags: ["aaaa"] } },
		{ path: "cd/cccc.md", yaml: { tags_defined: ["zzzz"] } },
		{ path: "cd/dddd.md" },
		{ path: "root.md" },
	],
	actions: [
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["ab/aaaa.md"], uses: ["ab/bbbb.md"] },
			"bbbb" : { defs: ["ab/bbbb.md"], uses: [] },
			"cccc" : { defs: ["cd/cccc.md"], uses: [] },
			"zzzz" : { defs: ["cd/cccc.md"], uses: [] },
			"dddd" : { defs: ["cd/dddd.md"], uses: [] },
			"root" : { defs: ["root.md"], uses: [] },
		}
	}]
});

testWorkspaceTagsCases.push({
	initialFiles : [
		{ path: "ab/aaaa.md", bodyTags: ["tag1", "tag2"] },
		{ path: "ab/bbbb.md", yaml: { tags: ["aaaa", "tag2"] } },
		{ path: "cd/cccc.md", yaml: { tags_defined: ["tag1"] } },
		{ path: "root.md", bodyTags: ["cccc"] },
	],
	actions: [
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["ab/aaaa.md"], uses: ["ab/bbbb.md"] },
			"bbbb" : { defs: ["ab/bbbb.md"], uses: [] },
			"cccc" : { defs: ["cd/cccc.md"], uses: ["root.md"] },
			"root" : { defs: ["root.md"], uses: [] },
			"tag1" : { defs: ["cd/cccc.md"], uses: ["ab/aaaa.md"]},
			"tag2" : { defs: [], uses: ["ab/aaaa.md", "ab/bbbb.md"]}
		}
	}]
});

testWorkspaceTagsCases.push({
	initialFiles : [
		{ path: "cite/aaaa.md", yaml: { tags_defined: ["cite1"] } },
		{ path: "cite/bbbb.md", bodyText: "see @[cite1] and @[cite2; and @root]" },
		{ path: "root.md", bodyText: "see [@cite3] and [also @cite4, pp. 5; or @cite5; or @aaaa]" },
	],
	actions: [
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["cite/aaaa.md"], uses: ["root.md"] },
			"bbbb" : { defs: ["cite/bbbb.md"], uses: [] },
			"root" : { defs: ["root.md"], uses: ["cite/bbbb.md"] },
			"cite1" : { defs: ["cite/aaaa.md"], uses: ["cite/aaaa.md", "cite/bbbb.md"] },
			"cite2" : { defs: [], uses: ["cite/bbbb.md"] },
			"cite3" : { defs: [], uses: ["root.md"] },
			"cite4" : { defs: [], uses: ["root.md"] },
			"cite5" : { defs: [], uses: ["root.md"] },
		}
	}]
});

export const testWorkspaceTagsSuite: TestSuite<TestWorkspaceTags> = {
	cases: testWorkspaceTagsCases
} 

////////////////////////////////////////////////////////////

let testWatchersCases:TestWorkspaceTags[] = [];

testWatchersCases.push({
	description: "there should be no tags for an empty workspace",
	initialFiles : [],
	actions: [
		{ action: "compareTags", expectTags : {} }
	]
});

testWatchersCases.push({
	description: "tags should update when a file change is detected (file name)",
	initialFiles : [],
	actions: [
		{ action: "save", file: { path: "dir/aaaa.md" } },
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["dir/aaaa.md"], uses: [] }
		}}
	]
});

testWatchersCases.push({
	description: "tags should update when a file change is detected (yaml tags)",
	initialFiles : [],
	actions: [
		{ action: "save", file: { path: "dir/aaaa.md", yaml: { tags: ["yaml1"] } } },
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["dir/aaaa.md"], uses: [] },
			"yaml1" : { defs: [], uses: ["dir/aaaa.md"] }
		}}
	]
});

testWatchersCases.push({
	description: "tags should update when a file change is detected (yaml tags_defined)",
	initialFiles : [],
	actions: [
		{ action: "save", file: { path: "dir/aaaa.md", yaml: { tags_defined: ["def1"] } } },
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["dir/aaaa.md"], uses: [] },
			"def1" : { defs: ["dir/aaaa.md"], uses: [] }
		}}
	]
});

testWatchersCases.push({
	description: "tags should update when a file change is detected (wikilink)",
	initialFiles : [],
	actions: [
		{ action: "save", file: { path: "dir/aaaa.md", bodyText: "[[wikilink]]" } },
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["dir/aaaa.md"], uses: [] },
			"wikilink" : { defs: [], uses: ["dir/aaaa.md"] }
		}}
	]
});

testWatchersCases.push({
	description: "tags should update when a file change is detected (citation)",
	initialFiles : [],
	actions: [
		{ action: "save", file: { path: "dir/aaaa.md", bodyText: "@[cite1]" } },
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["dir/aaaa.md"], uses: [] },
			"cite1" : { defs: [], uses: ["dir/aaaa.md"] }
		}},
		{ action: "save", file: { path: "dir/bbbb.md", bodyText: "@[cite2, pp.3; and @cite3]" } },
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["dir/aaaa.md"], uses: [] },
			"cite1" : { defs: [], uses: ["dir/aaaa.md"] },
			"bbbb" : { defs: ["dir/bbbb.md"], uses: [] },
			"cite2" : { defs: [], uses: ["dir/bbbb.md"] },
			"cite3" : { defs: [], uses: ["dir/bbbb.md"] }
		}},
		{ action: "save", file: { path: "dir/cccc.md", bodyText: "[see @cite4; also @cite3]" } },
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["dir/aaaa.md"], uses: [] },
			"cite1" : { defs: [], uses: ["dir/aaaa.md"] },
			"bbbb" : { defs: ["dir/bbbb.md"], uses: [] },
			"cite2" : { defs: [], uses: ["dir/bbbb.md"] },
			"cite3" : { defs: [], uses: ["dir/bbbb.md", "dir/cccc.md"] },
			"cccc" : { defs: ["dir/cccc.md"], uses: [] },
			"cite4" : { defs: [], uses: ["dir/cccc.md"] }
		}}
	]
});

testWatchersCases.push({
	description: "tags should update when a file is deleted",
	initialFiles : [],
	actions: [
		{ action: "compareTags", expectTags : {} },
		{ action: "save", file: { path: "dir/aaaa.md", yaml: { tags: ["tag1"] }, bodyText: "[[body1]]" } },
		{ action: "compareTags", expectTags : {
			"aaaa" : { defs: ["dir/aaaa.md"], uses: [] },
			"tag1" : { defs: [], uses: ["dir/aaaa.md"] },
			"body1" : { defs: [], uses: ["dir/aaaa.md"] }
		}},
		{ action: "delete", path: "dir/aaaa.md" },
		{ action: "compareTags", expectTags : {} }
	]
});

export const testWatchersSuite: TestSuite<TestWorkspaceTags> = {
	cases: testWatchersCases
}

// ---------------------------------------------------------

////////////////////////////////////////////////////////////

function testFile2Markdown(testFile: TestFile): string {
	let bodyTags = testFile.bodyTags || [];
	let tagText: string = bodyTags.map(tag => `[[${tag}]]`).join(" and ");
	let bodyText: string = testFile.bodyText || "";
	let markdown: string = dedent`
	---
	${YAML.stringify(testFile.yaml || {}).trim()}
	---
	# file: \`${testFile.path}\`
	${bodyText}
	${tagText}
	`;

	return markdown;
}

////////////////////////////////////////////////////////////

// some events may take a while to be detected, so we add some buffer time
// if a test sometimes fails, sometimes not, the delay may not be long enough
function busy(ms: number): Promise<void> {
	return new Promise((resolve, reject) => {
		setTimeout(() => resolve(), ms);
	});
}

async function actionSave(action: TestActionSave, fsal: FSALMock) {
	let markdown = testFile2Markdown(action.file);
	fsal.silentlySaveFile(action.file.path, markdown, true);
}

async function actionDelete(action: TestActionDelete, fsal: FSALMock) {
	fsal.silentlyDeleteFile(action.path);
}

function actionCompareTags(
	action: TestActionCompareTags,
	workspaceService: WorkspaceService,
	pluginService: PluginService
) {
	let actualFiles = flattenFileTree(workspaceService.getFileTree());

	// create mapping from hash -> path
	const hash2path_table: { [hash:string] : string } = {};
	Object.keys(actualFiles).forEach(path => { 
		let file = actualFiles[path];
		hash2path_table[file.hash] = path;
	});

	const hash2path = (hash: string) => {
		let result = hash2path_table[hash];
		assert.ok(result, `hash ${hash} not found in workspace`);
		return result
	}

	// helper to look up the hash that the workspace has assigned to each path
	const path2hash = (path:string) => {
		let actualFile = actualFiles[path];
		assert.ok(actualFile, `path ${path} not found in workspace`);
		return actualFile.hash;
	};

	// check tags
	let maybeXref = pluginService.getWorkspacePluginByName("crossref_plugin");
	assert.ok(maybeXref, "xref plugin not defined");
	let xref = maybeXref;

	// tags known by xref plugin should exactly match test case
	let expectTags = new Set(Object.keys(action.expectTags));
	let actualTags = new Set(xref._tag2docs.keys());
	assert.deepStrictEqual(actualTags, expectTags);

	// check defs / uses for each expected tag
	for(let tag in action.expectTags) {
		let actualDefs = new Set(xref.getDefsForTag(tag).map(hash2path));
		let actualUses = new Set(xref.getTagMentions(tag).map(hash2path));

		let expectDefs = new Set(action.expectTags[tag].defs);
		let expectUses = new Set(action.expectTags[tag].uses);
		expectUses = new Set([...expectDefs, ...expectUses]);

		assert.deepStrictEqual(actualUses, expectUses,
			`actual uses for tag "${tag}" should match expected\n\tactual: ${[...actualUses]}\n\texpected: ${[...expectUses]}`);
		assert.deepStrictEqual(actualDefs, expectDefs,
			`actual defs for tag "${tag}" should match expected\n\tactual: ${[...actualDefs]}\n\texpected: ${[...expectDefs]}`);
	}
}

////////////////////////////////////////////////////////////////////////////////

async function runTestWorkspaceTags(testCase: TestWorkspaceTags): Promise<void> {
	// create markdown files from test case data
	let initialFiles: MockFile[] = [];
	for(let testFile of testCase.initialFiles) {
		// create mock file
		initialFiles.push({
			type: "file",
			path: testFile.path,
			contents: testFile2Markdown(testFile)
		});
	}

	// initialize services necessary to open workspaces
	const fsal = new FSALMock(initialFiles);
	fsal.init();
	const workspaceService = new WorkspaceService(fsal);
	const pluginService = new PluginService(workspaceService);

	// open the workspace specified by the test
	await workspaceService.setWorkspaceDir("");

	// process action sequence specified by test case
	for(let action of testCase.actions) {
		switch(action.action) {
			case "save":
				await actionSave(action, fsal);
				await busy(10);
				break;	
			case "delete":
				await actionDelete(action, fsal);
				await busy(10);
				break;
			case "compareTags":
				actionCompareTags(action, workspaceService, pluginService);
				break;
		}
	}

	// close workspace, fsal, etc
	await workspaceService.closeWorkspace(true);
	fsal.close();
}

function flattenFileTree(tree: IDirEntryMeta[]): { [path:string] : IFileMeta } {
	let result: { [path:string] : IFileMeta } = { };
	
	tree.forEach(entry => {
		if(entry.type === "directory") {
			result = { ...result, ...flattenFileTree(entry.childrenMeta) };
		} else {
			result[entry.path] = entry;
		}
	});

	return result;
}

////////////////////////////////////////////////////////////

function runTestSuite<T extends TestCase<O>, O = unknown>(
	contextMsg: string,
	descPrefix: string,
	testSuite: TestSuite<T>,
	testRunner: (test: T, options: O) => Promise<unknown>
): void {
	context(contextMsg, () => {
		let idx = 0;
		for(let testCase of testSuite.cases) {
			let desc = `[${descPrefix} ${("00" + (++idx)).slice(-3)}] ` + (testCase.description || "");
			it(desc, () => {
				// merge suite options with case options
				const options: O = Object.assign({}, testSuite.options, testCase.options);
				// run the test
				return testRunner(testCase, options);
			});
		}
	});
}

////////////////////////////////////////////////////////////

// from markdown
describe('markdown syntax', () => {

	runTestSuite("test tag detection in files", "tags", testWorkspaceTagsSuite, runTestWorkspaceTags);
	runTestSuite("test file watcher behavior", "watch", testWatchersSuite, runTestWorkspaceTags);

});