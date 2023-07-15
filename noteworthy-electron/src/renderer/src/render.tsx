// node imports
import * as pathlib from "path-browserify";

// project imports
import type {
	MainIpcHandlers,
	MainIpc_LifecycleHandlers,
	MainIpc_FileHandlers,
	MainIpc_ThemeHandlers,
	MainIpc_ShellHandlers,
	MainIpc_DialogHandlers,
	MainIpc_TagHandlers,
	MainIpc_OutlineHandlers,
	MainIpc_MetadataHandlers,
	MainIpc_NavigationHandlers,
	MainIpc_CitationHandlers
// TODO (Ben @ 2023/04/30) refactor IPC to avoid errors with split project
// @ts-ignore
} from "@main/MainIPC";

import { RendererIpcEvents, RendererIpcHandlers } from "./RendererIPC";
import { IPossiblyUntitledFile, IDirEntryMeta, IFileMeta } from "@common/files";
import { invokerFor } from "@common/ipc";
import { to } from "@common/util/to";
import { IpcEvents } from "@common/events";

// editor importsimport { ProseMirrorEditor } from "./editors/editor-prosemirror";
import { MarkdownEditor } from "./editors/editor-markdown";
import { Editor } from "./editors/editor";

// ui imports
import { IFolderMarker, FileExplorer } from "./ui/explorer";
import { TagSearch } from "./ui/tag-search";
import { PanelBacklinks } from "./ui/panelBacklinks";
import { BibliographyComponent } from "./ui/bibliography";
import { Loading } from "./ui/loading";

// unist / unified
import * as Uni from "unist";
import * as Md from "@common/markdown/markdown-ast";

// solid js imports
import { render } from "solid-js/web";
import { Suspense, Switch, Match, For, Show, createResource, onCleanup, createSignal } from "solid-js";
import { Store as SolidStore, SetStoreFunction, createStore } from "solid-js/store"
import { CalendarTab } from "./ui/calendarTab";
import { OutlineTab } from "./ui/outlineTab";
import { HistoryTab } from "./ui/historyTab";
import { IOutline } from "@main/plugins/outline-plugin";
import { ITagSearchResult, IFileSearchResult } from "@main/plugins/crossref-plugin";

////////////////////////////////////////////////////////////

import { MouseButton } from "@common/inputEvents";
import { visitNodeType } from "@common/markdown/unist-utils";

////////////////////////////////////////////////////////////

// extensions
import { NoteworthyExtension, NoteworthyExtensionInitializer, RegisteredExtensionName } from "@common/extensions/noteworthy-extension";
import codeMirrorPreviewExtension from "@extensions/noteworthy-codemirror-preview";
import tikzJaxExtension from "@extensions/noteworthy-tikzjax";
import autocompleteExtension from "@extensions/noteworthy-autocomplete";
import { NoteworthyExtensionApi } from "@common/extensions/extension-api";

// this is a "safe" version of ipcRenderer exposed by the preload script
const ipcRenderer = window.restrictedIpcRenderer;

////////////////////////////////////////////////////////////

export interface IRendererState {
	activeTab: number,
	activeLowerTab: number,
	showLowerPanel: boolean,
	activeFile: null|IPossiblyUntitledFile;
	fileTree: [IFolderMarker, IDirEntryMeta[]][];
	navigationHistory: { history: IFileMeta[], currentIdx: number };
	themeCss: string;
	selection: { to:number, from:number };
	markdownAst: null|Uni.Node;
}

class Renderer {

	// renderer objects
	_mainProxy: MainIpcHandlers;
	_eventHandlers: RendererIpcHandlers;

	// ui elements
	_ui:null | {
		titleElt: HTMLDivElement;
		editorElt: HTMLDivElement;
	}

	_react:null | { state: SolidStore<IRendererState>, setState: SetStoreFunction<IRendererState> };

	// extensions
	_extensions: { [N in RegisteredExtensionName] ?: NoteworthyExtension<N, RegisteredExtensionName[]> }

	// prosemirror
	_editor: Editor | null;
	_currentFile: IPossiblyUntitledFile;

	// sidebar
	_fileTree: [IFolderMarker, IDirEntryMeta[]][];

	constructor() {
		// initialize objects
		const channel = "command";
		const logPrefix = "render->main";
		this._mainProxy = {
			lifecycle:  invokerFor<MainIpc_LifecycleHandlers>  (ipcRenderer, channel, logPrefix, "lifecycle"),
			file:       invokerFor<MainIpc_FileHandlers>       (ipcRenderer, channel, logPrefix, "file"),
			theme:      invokerFor<MainIpc_ThemeHandlers>      (ipcRenderer, channel, logPrefix, "theme"),
			shell:      invokerFor<MainIpc_ShellHandlers>      (ipcRenderer, channel, logPrefix, "shell"),
			dialog:     invokerFor<MainIpc_DialogHandlers>     (ipcRenderer, channel, logPrefix, "dialog"),
			tag:        invokerFor<MainIpc_TagHandlers>        (ipcRenderer, channel, logPrefix, "tag"),
			outline:    invokerFor<MainIpc_OutlineHandlers>    (ipcRenderer, channel, logPrefix, "outline"),
			metadata:   invokerFor<MainIpc_MetadataHandlers>   (ipcRenderer, channel, logPrefix, "metadata"),
			navigation: invokerFor<MainIpc_NavigationHandlers> (ipcRenderer, channel, logPrefix, "navigation"),
			citations:  invokerFor<MainIpc_CitationHandlers>   (ipcRenderer, channel, logPrefix, "citations")
		}

		this._eventHandlers = new RendererIpcHandlers(this);

		/** @todo (9/12/20) this is here for debug purposes only */
		(window as any).renderer = this;

		/** @todo (6/9/20) propery set modTime/creationTime */
		this._currentFile = {
			type: "file",
			contents: "",
			modTime: -1,
			creationTime: -1
		};

		this._fileTree = [];
		this._editor = null;
		this._ui = null;
		this._react = null;
		this._extensions = {};
	}

	init() {
		ipcRenderer.receive(IpcEvents.RENDERER_INVOKE,
			(responseId: string, key: RendererIpcEvents, data: any) => {
				console.log("render.on() :: RENDERER_INVOKE ::", responseId, key, data);
				this.handle(key, data)
					.then((result: any) => { ipcRenderer.send(responseId, true, result); })
					.catch((reason: any) => { ipcRenderer.send(responseId, false, reason); });
			}
		);

		// initialize interface
		this._ui = this.initUI();
		this.initKeyboardEvents();

		// initialize extensions
		this.initExtensions(this._mainProxy, this._ui.editorElt);

		// set current file
		if (this._currentFile) {
			this.setCurrentFile(this._currentFile);
		}
	}

	initUI() {
		const App = () => {
			// create solid state
			let [state, setState] = createStore<IRendererState>({
				activeTab: 0,
				activeLowerTab: 0,
				showLowerPanel: true,
				activeFile: null,
				fileTree:[],
				navigationHistory: { history: [], currentIdx: 0 },
				themeCss: "",
				selection: {to:0, from:0},
				markdownAst: null
			});
			this._react = { state, setState }

			// state computations
			const activeHash = () => {
				if(state.activeFile !== null && "hash" in state.activeFile){
					return state.activeFile.hash;
				} else {
					return null;
				}
			}

			const getOutline = async (): Promise<IOutline|null> => {
				let hash = activeHash();
				if(!hash){ return null; }
				let outline = await this._mainProxy.outline.requestOutlineForHash(hash);
				return outline;
			}

			const tabLabels = [
				{ title: "Workspace", codicon: "codicon-folder-opened" },
				{ title: "Outline",   codicon: "codicon-book" },
				{ title: "Tags",      codicon: "codicon-symbol-numeric" },
				{ title: "Themes",    codicon: "codicon-symbol-color" },
				{ title: "Calendar",  codicon: "codicon-calendar" },
			];

			const lowerTabLabels = [
				{ title: "Backlinks" },
				{ title: "Bibliography" },
			]

			const handleFileClick = (evt:MouseEvent) => {
				let target:HTMLElement = evt.currentTarget as HTMLElement;

				/** FIXME this is hacky, handle properly next time! */
				if(target.className == "folder"){
					let collapsed:string = target.getAttribute("data-collapsed") || "false";
					target.setAttribute("data-collapsed", collapsed == "true" ? "false" : "true");
					return;
				}

				let fileHash = target.getAttribute("data-filehash");
				if(fileHash === null){ return; }

				this._mainProxy.navigation.navigateToHash({ hash: fileHash });
			}

			const handleTagClick = (evt:MouseEvent) => {
				let target:HTMLElement = evt.currentTarget as HTMLElement;
				let tag = target.getAttribute("data-tag");
				if(tag === null){ return; }
				this._mainProxy.navigation.navigateToTag({ tag, create: false });
			}

			const handleAppClicked = (evt:MouseEvent) => {
				switch(evt.button){
					case MouseButton.BACK:
						this._mainProxy.navigation.navigatePrev();
						break;
					case MouseButton.FORWARD:
						this._mainProxy.navigation.navigateNext();
						break;
				}
			}

			const handleHistoryClick = (evt: MouseEvent) => {
				let target: HTMLElement = evt.currentTarget as HTMLElement;

				let historyIdxAttr = target.getAttribute("data-history-idx");
				if(historyIdxAttr === null){ return; }

				let historyIdx: number = parseInt(historyIdxAttr);
				if(isNaN(historyIdx)){ return; }

				this._mainProxy.navigation.navigateToIndex(historyIdx);
			}

			const search = async (query:string): Promise<(ITagSearchResult|IFileSearchResult)[]> => {
				let result = await this._mainProxy.tag.fuzzyTagFileSearch(query);
				return result;
			}

			// components
			const AppSidebar = () => {
				return (<div id="sidebar">
					{/* Sidebar Content */}
					<div class="content"><Suspense fallback={<Loading/>}>
						<Switch>
							<Match when={state.activeTab == 0}>
								<FileExplorer
									activeHash={activeHash()}
									fileTree={state.fileTree}
									handleClick={handleFileClick} />
							</Match>
							<Match when={state.activeTab == 1}>
								<OutlineTab getOutline={getOutline} />
							</Match>
							<Match when={state.activeTab == 2}>
								<TagSearch getSearchResults={search} handleTagClick={handleTagClick} handleFileClick={handleFileClick}/>
							</Match>
							<Match when={state.activeTab == 3}>
								<HistoryTab
									navHistory={state.navigationHistory}
									handleHistoryClick={handleHistoryClick}
								/>
							</Match>
							<Match when={state.activeTab == 4}>
								<CalendarTab />
							</Match>
						</Switch>
					</Suspense></div>
					{/* Sidebar Tabs*/}
					<nav class="tabs">
						<For each={tabLabels}>
						{ (tab,idx) => {
							let active = ()=>(state.activeTab == idx());
							return (
								<a class={`tab ${active()?"active":""}`} title={tab.title} onClick={()=>setState({ activeTab: idx()})}>
									<span class={`codicon ${tab.codicon}`}></span>
								</a>
							)}
						}
						</For>
					</nav>
				</div>);
			}

			const AppLowerPanel = () => {
				return (<div id="lower-panel">
					{/* Tabs*/}
					<nav class="tabs">
						<For each={lowerTabLabels}>
						{ (tab,idx) => {
							let active = ()=>(state.activeLowerTab == idx());
							return (
								<a
									class={`tab ${active()?"active":""}`}
									title={tab.title}
									onClick={()=>{
										if(state.activeLowerTab === idx()) {
											setState({ showLowerPanel: !state.showLowerPanel })
										} else {
											setState({ activeLowerTab: idx(), showLowerPanel: true })
										}
									}}
								>
									{tab.title}
								</a>
							)}
						}
						</For>
					</nav>
					{/* Content */}
					<Show when={state.showLowerPanel}>
					<div class="content">
						<Suspense fallback={<Loading/>}>
							<Switch>
								<Match when={state.activeLowerTab == 0}>
									<PanelBacklinks
										proxy={this._mainProxy}
										hash={activeHash()}
										fileName={activeFileName()}
										handleFileClick={handleFileClick}
									/>
								</Match>
								<Match when={state.activeLowerTab == 1}>
									<BibliographyComponent proxy={this._mainProxy} citationKeys={extractCitations()} />
								</Match>
							</Switch>
						</Suspense>
					</div>
					</Show>
				</div>);
			}

			const extractCitations = (): string[] => {
				if(!state.markdownAst) { return []; }
				const result: Set<string> = new Set();
				visitNodeType<Md.Cite>(state.markdownAst, "cite", (node: Md.Cite) => {
					node.data.citeItems.map(c => c.key).forEach(k => result.add(k));
				});

				return [...result];
			}

			const AppContent = () => {
				return (<div id="content" class="document">
					<div id="editor" spellcheck={false}></div>
				</div>);
			}

			const AppFooter = () => {
				return (
					<div id="footer">
						<div id="title">{state.activeFile?.path || "(no file selected)"}</div>
					</div>
				);
			}

			const activeFileName = () => {
				let name = state.activeFile?.name;
				if(!name) { return null; }
				// trim extension
				let dotIdx = name.indexOf(".");
				if(dotIdx < 0) { return name; }
				else { return name.slice(0, dotIdx) || null; }
			}

			const timer = setInterval(() => {
				if(!this._editor) { return; }

				// attempt to parse markdown ast from editor
				this._react?.setState({
					markdownAst: this._editor.getAst()
				});
			}, 10000);

			onCleanup(() => {
				clearInterval(timer);
			});

			return (<>
				<style>{state.themeCss}</style>
				<div id="app" class={state.showLowerPanel ? "" : "collapsePanel"} onMouseUp={handleAppClicked}>
					<AppSidebar />
					<AppContent />
					<AppLowerPanel />
					<AppFooter />
				</div>
			</>)
		}

		let mainElt:HTMLElement = document.getElementById("main") as HTMLElement;
		render(() => <App/>, mainElt);

		/** @todo (9/12/20) the line below requests the CSS only after the UI
		 * has started rendering.  this is not a great solution, can we do better?
		 */
		this._mainProxy.theme.requestThemeRefresh();

		// dom elements
		return {
			titleElt : document.getElementById("title") as HTMLDivElement,
			editorElt : document.getElementById("editor") as HTMLDivElement
		}
	}

	initKeyboardEvents() {
		// ctrl handler
		/** @todo (6/20/20) where should this code go? */
		const shiftHandler = (evt: KeyboardEvent) => {
			if (evt.ctrlKey) { document.body.classList.add("user-ctrl"); }
			else { document.body.classList.remove("user-ctrl"); }
		};

		document.addEventListener("keydown", shiftHandler);
		document.addEventListener("keyup", shiftHandler);
		document.addEventListener("keypress", shiftHandler);

		// keyboard shortcuts
		const keyboardHandler = async (evt: KeyboardEvent) => {
			if(evt.ctrlKey && evt.key === "n") {
				let newFile = await this._mainProxy.dialog.dialogFileNew();
				console.log("creating new file", newFile);
			}
		}

		document.addEventListener("keypress", keyboardHandler);
	}

	//////////////////////////////////////////////////////////

	initExtensions(
		mainProxy: MainIpcHandlers,
		editorElt: HTMLElement
	) {
		// TODO (Ben @ 2023/05/02) extension api was added as a quick hack
		// while writing the autocomplete extension, and should be revisited

		const noteworthyApi: NoteworthyExtensionApi = {
			fuzzyTagSearch: async (query) => {
				const result = await mainProxy.tag.fuzzyTagSearch(query);

				// return only specific properties, since the result may have extra data
				return result.map(({ result, resultEmphasized }) => ({ result, resultEmphasized }))
			},

			registerCommand: (name: string, handler: () => void) => {
				// TODO
			}
		}

		// TODO (Ben @ 2023/04/16) topologically sort extensions, rather than doing it by hand
		// TODO (Ben @ 2023/04/16) is it possible to assign a more specific type here?  (existential? path-dependent?)
		let extensionInitializers: NoteworthyExtensionInitializer<RegisteredExtensionName, RegisteredExtensionName[]>[] = [
			codeMirrorPreviewExtension,
			tikzJaxExtension,
			autocompleteExtension
		];

		// initialize noteworthy extensions
		let extensions: { [N in RegisteredExtensionName] ?: NoteworthyExtension<N, RegisteredExtensionName[]> } = {};

		function isNameOfRegisteredExtension(s: string): s is RegisteredExtensionName {
			return s in extensions;
		}

		extensionInitializers.forEach((initializer) => {
			const ext = initializer.initialize({
				editorElt: editorElt,
				api: noteworthyApi
			});
			const extName = initializer.spec.name;
			extensions[extName] = ext;

			// pass config from this extension to its dependencies
			const sharedConfig = initializer.spec.config;
			if(sharedConfig !== undefined) {
				Object.keys(sharedConfig).forEach(depName => {
					if(!isNameOfRegisteredExtension(depName)) {
						console.error(`dependency ${depName} of extension ${extName} not yet registered`);
						return;
					}

					// TODO (Ben @ 2023/04/16) remove this ts-ignore
					// after updating typescript, perhaps this is solved by correlated record types?
					// @ts-ignore
					extensions[depName]?.updateConfig(sharedConfig[depName]);
				});
			}
		});

		this._extensions = extensions;
	}

	////////////////////////////////////////////////////////

	handle<T extends RendererIpcEvents>(name: T, data: Parameters<RendererIpcHandlers[T]>[0]) {
		return this._eventHandlers[name](data as any);
	}

	applyThemeCss(cssString:string){
		this._react?.setState({ themeCss : cssString });
	}

	async setCurrentFile(file: IPossiblyUntitledFile): Promise<void> {
		// clean up current editor
		/** @todo (6/9/20) improve performance by not completely
		 * deleting old editor when new file has same type as old one */
		if (this._editor) {
			/** @todo (7/12/20) would this be better as a try/catch? */
			let [err, result] = await to<string>(this._editor.closeAndDestroy());
			if (err == "Cancel") { return; }
			else if (err) { return Promise.reject(err); }
		}

		// set current file
		console.log("render :: setCurrentFile", file);
		this._currentFile = file;

		// update interface
		if(!this._ui){ throw new Error("no user interface active!"); }

		this._react?.setState({
			activeFile: file
		});

		let ext: string = pathlib.extname(this._currentFile.path || "");

		// notify ui of selection change
		let setSelectionInfo = (selection: {to:number, from:number}): void => {
			console.log("set selection", selection);
			this._react?.setState({selection});
		};

		// set current editor
		// (no way to describe type of abstract constructor)
		// (https://github.com/Microsoft/TypeScript/issues/5843)
		let editor:Editor;
		const args = [
			this._currentFile,
			this._ui.editorElt,
			this._mainProxy,
			this._extensions,
			setSelectionInfo
		] as const;

		switch (ext) {
			case ".md":      editor = new MarkdownEditor(...args);    break;
			default:         editor = new MarkdownEditor(...args); break;
		}

		// initialize editor
		this._editor = editor;
		this._editor.init();
	}

	setNavHistory(navHistory: IRendererState["navigationHistory"]) {
		this._react?.setState({ navigationHistory: navHistory });
	}

	setFileTree(fileTree:IDirEntryMeta[]){
		console.log("render :: setFileTree");
		// sort file tree!
		/** @todo (7/14/20) this is hacky, should fix properly */
		let sorted = fileTree.map(entry => ({entry, pathSplit:entry.path.split(pathlib.sep)}))
			.sort((a,b) => {
				let na = a.pathSplit.length;
				let nb = b.pathSplit.length;
				for(let i = 0; i < Math.max(na,nb); i++){
					if(i >= na){ return  1; }
					if(i >= nb){ return -1; }
					if(a.pathSplit[i] == b.pathSplit[i]) continue;

					let alast = (i == na - 1);
					let blast = (i == nb - 1);
					if(alast && !blast){ return 1; }
					if(!alast && blast){ return -1; }

					return (a.pathSplit[i] < b.pathSplit[i]) ? -1 : 1;
				}
				return (a.entry.path < b.entry.path)?-1:1;
			});

		fileTree = sorted.map(val => val.entry);

		// find common prefix by comparing first/last sorted paths
		// (https://stackoverflow.com/a/1917041/1444650)
		let a1:string = fileTree[0].path;
		let a2:string = fileTree[fileTree.length-1].path;
		let i:number = 0;
		while(i < a1.length && a1.charAt(i) === a2.charAt(i)) i++;
		let prefix = a1.substring(0, i);

		// insert folder markers
		// TODO (2021-06-01) rewrite file tree code, it's an accident waiting to happen!
		let directories:[IFolderMarker, IDirEntryMeta[]][] = [];
		let folderMarker:IFolderMarker|null = null;

		let startIdx = 0;
		let prevDir:string|null = null;
		for(let idx = 0; idx < fileTree.length + 1; idx++){
			let lastIdx = (idx === fileTree.length);
			let dirPath: string = lastIdx ? (prevDir||"") : pathlib.dirname(fileTree[idx].path);

			if(lastIdx || dirPath !== prevDir){
				// add previous folder
				if(folderMarker && (idx-startIdx > 0)){
					directories.push([folderMarker, fileTree.slice(startIdx, idx)]);
				}

				// set new foldermarker
				folderMarker = {
					folderMarker: true,
					path: dirPath || "<root>",
					pathSuffix: dirPath.substring(prefix.length),
					name: pathlib.basename(dirPath)
				};

				prevDir = dirPath;
				startIdx = idx;
			}
		}

		this._fileTree = directories;
		this._react?.setState({ fileTree: this._fileTree });
	}
}

export default Renderer;
