// node imports
import * as pathlib from "path";
import { ipcRenderer, IpcRendererEvent } from "electron";

// project imports
import { MainIpcHandlers } from "@main/MainIPC";
import { RendererIpcEvents, RendererIpcHandlers } from "./RendererIPC";
import { IPossiblyUntitledFile, IFileWithContents, IUntitledFile, IFileMeta, IDirEntryMeta } from "@common/fileio";
import { invokerFor } from "@common/ipc";
import { to } from "@common/util/to";
import { IpcEvents } from "@common/events";

// editor importsimport { ProseMirrorEditor } from "./editors/editor-prosemirror";
import { ProseMirrorEditor } from "./editors/editor-prosemirror";
import { MarkdownEditor } from "./editors/editor-markdown";
import { IpynbEditor } from "./editors/editor-ipynb";
import { JournalEditor } from "./editors/editor-journal";
import { NwtEditor } from "./editors/editor-nwt";
import { Editor } from "./editors/editor";

// ui imports
import { IFolderMarker, FileExplorer } from "./ui/explorer";
import { TagSearch } from "./ui/tag-search";

// solid js imports
import { render } from "solid-js/dom";
import { State as SolidState, SetStateFunction, createState, createEffect, createSignal, Suspense, Switch, Match, For } from "solid-js";
import { CalendarTab } from "./ui/calendarTab";

////////////////////////////////////////////////////////////

interface IRendererState {
	activeTab: number,
	activeFile: null|IPossiblyUntitledFile;
	fileTree: [IFolderMarker, IDirEntryMeta[]][];
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
	_editor: ProseMirrorEditor | null;
	_currentFile: IPossiblyUntitledFile;

	// sidebar
	_fileTree: [IFolderMarker, IDirEntryMeta[]][];

	constructor() {
		// initialize objects
		this._mainProxy = invokerFor<MainIpcHandlers>(ipcRenderer, "command", "render->main");
		this._eventHandlers = new RendererIpcHandlers(this);

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

		// handle events from main
		ipcRenderer.on("mainCommand", (evt, key: RendererIpcEvents, data: any) => {
			this.handle(key, data);
		});

		ipcRenderer.on(IpcEvents.RENDERER_INVOKE,
			(evt, responseId: string, key: RendererIpcEvents, data: any) => {
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

			const Loading = () => {
				return (<div>loading...</div>);
			}

			const tabLabels = [
				{ codicon: "codicon-folder-opened" },
				{ codicon: "codicon-book" },
				{ codicon: "codicon-symbol-numeric" },
				{ codicon: "codicon-symbol-color" },
				{ codicon: "codicon-calendar" },
			];

			const handleClick = (evt:MouseEvent) => {
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
				this._mainProxy.requestFileOpen({ hash: fileHash });
			}

			const search = async (query:string) => {
				console.log("searching...", query);
				let result = await this._mainProxy.tagSearch(query);
				return result;
			}

			// components
			const AppSidebar = () => {
				return (<div id="sidebar">
					{/* Sidebar Content */}
					<div class="content"><Suspense fallback={<Loading/>}>
						<Switch>
							<Match when={state.activeTab == 0}>
								<FileExplorer activeHash={activeHash()} fileTree={state.fileTree} handleClick={handleClick}/>
							</Match>
							<Match when={state.activeTab == 1}>
								<div id="tab_outline">outline</div>
							</Match>
							<Match when={state.activeTab == 2}>
								<TagSearch getSearchResults={search} handleClick={handleClick} />
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
								<a class={`tab ${active()?"active":""}`} onClick={()=>setState({ activeTab: idx()})}>
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
					<div spellcheck={false} id="editor"></div>
				</div>);
			}

			const AppFooter = () => {
				return (
					<div id="footer">
						<div id="title">{state.activeFile?.path || "(no file selected)"}</div>
					</div>
				);
			}

			return (<div id="app">
				<AppSidebar />
				<AppContent />
				<AppFooter />
			</div>)
		}

		let mainElt:HTMLElement = document.getElementById("main") as HTMLElement;
		render(() => <App/>, mainElt);

		// dom elements
		this._ui = {
			titleElt : document.getElementById("title") as HTMLDivElement,
			editorElt : document.getElementById("editor") as HTMLDivElement,
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
		let EditorConstructor:(typeof ProseMirrorEditor);
		switch (ext) {
			case ".ipynb":   EditorConstructor = IpynbEditor;       break;
			case ".json":    EditorConstructor = ProseMirrorEditor; break;
			case ".journal": EditorConstructor = JournalEditor;     break;
			case ".nwt":     EditorConstructor = NwtEditor;         break;
			default:         EditorConstructor = MarkdownEditor;    break;
		}

		// initialize editor
		this._editor = new EditorConstructor(this._currentFile, this._ui.editorElt, this._mainProxy);
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