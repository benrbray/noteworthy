// node imports
import * as pathlib from "path";

// project imports
import { MainIpcHandlers, MainIpc_LifecycleHandlers, MainIpc_FileHandlers, MainIpc_ThemeHandlers, MainIpc_ShellHandlers, MainIpc_DialogHandlers, MainIpc_TagHandlers, MainIpc_OutlineHandlers, MainIpc_MetadataHandlers } from "@main/MainIPC";
import { RendererIpcEvents, RendererIpcHandlers } from "./RendererIPC";
import { IPossiblyUntitledFile, IDirEntryMeta } from "@common/files";
import { invokerFor } from "@common/ipc";
import { to } from "@common/util/to";
import { IpcEvents } from "@common/events";

// editor importsimport { ProseMirrorEditor } from "./editors/editor-prosemirror";
import { MarkdownEditor } from "./editors/editor-markdown";
import { Editor } from "./editors/editor";

// ui imports
import { IFolderMarker, FileExplorer } from "./ui/explorer";
import { TagSearch } from "./ui/tag-search";

// solid js imports
import { render } from "solid-js/dom";
import { State as SolidState, SetStateFunction, createState, Suspense, Switch, Match, For } from "solid-js";
import { CalendarTab } from "./ui/calendarTab";
import { OutlineTab } from "./ui/outlineTab";
import { IOutline } from "@main/plugins/outline-plugin";
import { ITagSearchResult, IFileSearchResult } from "@main/plugins/crossref-plugin";

////////////////////////////////////////////////////////////

// The use of `contextIsolation=true` for election requires a preload phase to
// expose Electron APIs to the render process.  These APIs are made available
// globally at runtime, and I haven't found clever enough typings yet to express
// this transformation.  So, we must explicitly declare them here:
import { WindowAfterPreload } from "@renderer/preload_types";
declare let window: Window & typeof globalThis & WindowAfterPreload;
// this is a "safe" version of ipcRenderer exposed by the preload script
const ipcRenderer = window.restrictedIpcRenderer;

////////////////////////////////////////////////////////////

interface IRendererState {
	activeTab: number,
	activeFile: null|IPossiblyUntitledFile;
	fileTree: [IFolderMarker, IDirEntryMeta[]][];
	themeCss: string;
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

	_react:null | { state: SolidState<IRendererState>, setState: SetStateFunction<IRendererState> };

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
			lifecycle: invokerFor<MainIpc_LifecycleHandlers>(ipcRenderer, channel, logPrefix, "lifecycle"),
			file:      invokerFor<MainIpc_FileHandlers>     (ipcRenderer, channel, logPrefix, "file"),
			theme:     invokerFor<MainIpc_ThemeHandlers>    (ipcRenderer, channel, logPrefix, "theme"),
			shell:     invokerFor<MainIpc_ShellHandlers>    (ipcRenderer, channel, logPrefix, "shell"),
			dialog:    invokerFor<MainIpc_DialogHandlers>   (ipcRenderer, channel, logPrefix, "dialog"),
			tag:       invokerFor<MainIpc_TagHandlers>      (ipcRenderer, channel, logPrefix, "tag"),
			outline:   invokerFor<MainIpc_OutlineHandlers>  (ipcRenderer, channel, logPrefix, "outline"),
			metadata:  invokerFor<MainIpc_MetadataHandlers> (ipcRenderer, channel, logPrefix, "metadata"),
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
	}

	init() {
		console.log("render :: init()");

		ipcRenderer.receive(IpcEvents.RENDERER_INVOKE,
			(responseId: string, key: RendererIpcEvents, data: any) => {
				console.log("render.on() :: RENDERER_INVOKE ::", responseId, key, data);
				this.handle(key, data)
					.then((result: any) => { ipcRenderer.send(responseId, true, result); })
					.catch((reason: any) => { ipcRenderer.send(responseId, false, reason); });
			}
		);

		// initialize interface
		this.initUI();
		this.initKeyboardEvents();

		// set current file
		if (this._currentFile) {
			this.setCurrentFile(this._currentFile);
		}
	}

	initUI() {
		const App = () => {
			// create solid state
			let [state, setState] = createState<IRendererState>({
				activeTab: 0,
				activeFile: null,
				fileTree:[],
				themeCss: ""
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
				console.log("getOutline");
				let hash = activeHash();
				if(!hash){ return null; }
				console.log("getOutline :: hash=", hash);
				let outline = await this._mainProxy.outline.requestOutlineForHash(hash);
				console.log("outline found", outline);
				return outline;
			}

			const Loading = () => {
				return (<div>loading...</div>);
			}

			const tabLabels = [
				{ title: "Workspace", codicon: "codicon-folder-opened" },
				{ title: "Outline",   codicon: "codicon-book" },
				{ title: "Tags",      codicon: "codicon-symbol-numeric" },
				{ title: "Themes",    codicon: "codicon-symbol-color" },
				{ title: "Calendar",  codicon: "codicon-calendar" },
			];

			const handleFileClick = (evt:MouseEvent) => {
				let target:HTMLElement = evt.currentTarget as HTMLElement;

				/** @todo this is hacky, handle properly next time! */
				if(target.className == "folder"){
					let collapsed:string = target.getAttribute("data-collapsed") || "false";
					target.setAttribute("data-collapsed", collapsed == "true" ? "false" : "true");
					return;
				}

				let fileHash = target.getAttribute("data-filehash");
				if(fileHash === null){ return; }
				
				console.log("explorer :: clicked", fileHash);
				this._mainProxy.file.requestFileOpen({ hash: fileHash });
			}

			const handleTagClick = (evt:MouseEvent) => {
				let target:HTMLElement = evt.currentTarget as HTMLElement;
				let tag = target.getAttribute("data-tag");
				if(tag === null){ return; }
				this._mainProxy.tag.requestTagOpen({ tag, create: false });
			}

			const search = async (query:string): Promise<(ITagSearchResult|IFileSearchResult)[]> => {
				console.log("searching...", query);
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
								<div id="tab_theme">themes</div>
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

			const AppContent = () => {
				return (<div id="content">
				</div>);
			}

			const AppFooter = () => {
				return (
					<div id="footer">
						<div id="title">{state.activeFile?.path || "(no file selected)"}</div>
					</div>
				);
			}

			return (<>
				<style>{state.themeCss}</style>
				<div id="app">
					<AppSidebar />
					<AppContent />
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

		// create shadow dom
		let contentElt = document.getElementById("content") as HTMLElement;
		//let shadowElt = contentElt.attachShadow({mode: "open"});

		// create editor
		let editorElt = document.createElement("div");
		editorElt.setAttribute("id", "editor");
		editorElt.setAttribute("spellcheck", "false");
		contentElt.appendChild(editorElt);

		// dom elements
		this._ui = {
			titleElt : document.getElementById("title") as HTMLDivElement,
			editorElt : editorElt
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

		// set current editor
		// (no way to describe type of abstract constructor)
		// (https://github.com/Microsoft/TypeScript/issues/5843)
		let editor:Editor;
		const args = [this._currentFile, this._ui.editorElt, this._mainProxy] as const;
		switch (ext) {
			/** @todo (9/27/20) re-enable other file types */
			//case ".ipynb":   editor = new IpynbEditor(...args);       break;
			//case ".json":    editor = new ProseMirrorEditor(...args); break;
			//case ".journal": editor = new JournalEditor(...args);     break;
			//case ".nwt":     editor = new NwtEditor(...args);         break;
			case ".md":      editor = new MarkdownEditor(...args);    break;
			default:         editor = new MarkdownEditor(...args); break;
		}

		// initialize editor
		this._editor = editor;
		this._editor.init();
	}

	setCurrentFilePath(filePath: string): void {
		this._editor?.setCurrentFilePath(filePath);
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
		let directories:[IFolderMarker, IDirEntryMeta[]][] = [];
		let folderMarker:IFolderMarker|null = null;
		let fileList:IDirEntryMeta[] = [];
		let startIdx = 0;
		let prevDir = null;
		for(let idx = 0; idx < fileTree.length; idx++){
			let dirPath:string = pathlib.dirname(fileTree[idx].path);

			if(dirPath !== prevDir){
				// add previous folder
				if(folderMarker && (idx-startIdx > 0)){ 
					directories.push([folderMarker, fileTree.slice(startIdx, idx)]);
				}

				// set new foldermarker
				folderMarker = {
					folderMarker: true,
					path: dirPath,
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