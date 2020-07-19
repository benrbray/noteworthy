// node imports
import * as pathlib from "path";

// project imports
import { RendererIpcEvents, RendererIpcHandlers } from "./RendererIPC";
import { IPossiblyUntitledFile, IFileWithContents, IUntitledFile } from "@common/fileio";
import { ProseMirrorEditor } from "./editors/editor-prosemirror";
import { MarkdownEditor } from "./editors/editor-markdown";
import { IpynbEditor } from "./editors/editor-ipynb";
import { Explorer } from "./explorer/explorer";
import { JournalEditor } from "./editors/editor-journal";
import { MainIpcHandlers } from "@main/MainIPC";
import { ipcRenderer, IpcRendererEvent } from "electron";
import { invokerFor } from "@common/ipc";
import { NwtEditor } from "./editors/editor-nwt";
import { to } from "@common/util/to";
import { IpcEvents } from "@common/events";
import { Editor } from "./editors/editor";

// solid js imports
import { render } from "solid-js/dom";
import { createState, createEffect, createSignal } from "solid-js";

////////////////////////////////////////////////////////////

class Renderer {

	// renderer objects
	_mainProxy: MainIpcHandlers;
	_eventHandlers: RendererIpcHandlers;

	// ui elements
	_ui:null | {
		titleElt: HTMLDivElement;
		editorElt: HTMLDivElement;
	}

	_react:null | any;

	// prosemirror
	_editor: ProseMirrorEditor | null;
	_currentFile: IPossiblyUntitledFile;

	// sidebar
	_explorer: Explorer | undefined;

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
		console.log("\n\nUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIUIv\n\n\n");
		const App = () => {
			// create solid state
			let [state, setState] = createState({filePath:"not reactive!"});
			this._react = { state, setState }

			// print file path on change
			createEffect(()=>console.log("\n\nfilePath:", state.filePath, "\n\n\n"));

			// components
			const AppSidebar = () => {
				return (<div id="sidebar">
					<div class="explorer" id="explorer"></div>
				</div>);
			}

			const AppContent = () => {
				return (<div id="content"><div id="editor"></div></div>);
			}

			const AppFooter = () => {
				return (
					<div id="footer" onClick={() => setState("filePath", l => l + "!")}>
						<div id="title">{state.filePath}</div>
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

		// explorer
		let explorerElt:HTMLElement = document.getElementById("explorer") as HTMLElement;
		this._explorer = new Explorer(explorerElt, this._mainProxy);
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
		
		this._react.setState({filePath: file.path || "<untitled>"});
		
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
}

export default Renderer;