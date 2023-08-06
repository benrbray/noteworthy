import { createSignal } from "solid-js";
import "./ModalNewFile.css"

export interface ModalNewFileProps {
	promptFilePath: () => Promise<string>,
	handleSubmit: (name: string) => void;
	handleCancel: () => void;
	workspaceRoot: string
}

export const ModalNewFile = (props: ModalNewFileProps) => {
	const [selectedFolder, setSelectedFolder] = createSignal<string|null>(null);
	const [selectedFilename, setSelectedFilename] = createSignal<string|null>(null);

	const setFolderRoot = () => {
		setSelectedFolder(props.workspaceRoot);
	}

	const setFolderPrompt = () => {
		console.log("[setFolderCurrent]");
		props.promptFilePath().then((path: string) => {
			console.log(`selected ${path}`);
			setSelectedFolder(path);
		}, (err) => {
			console.error("no file path!");
		});
	}

	return (<div class="modal-newfile">
		<div class="section newfile-folder input-box">
			{/* <span class="newfile-folder-workspace" title={props.workspaceRoot}>
				WORKSPACE/
			</span> */}
			<input
				spellcheck={false}
				class="newfile-folder-input"
				value={selectedFolder() || ""}
				onInput={(evt) => setSelectedFolder(evt.target.value) }
			/>
		</div>

		<div>{selectedFolder()}</div>

		<div class="section">
		<button onClick={setFolderPrompt}>Choose Path...</button>
		</div>

		{/* <div class="section">
		<input class="newfile-name input-box" />
		</div> */}

		<div class="modal-button-row">
			<button
				class="modal-button"
				onClick={props.handleCancel}
			>
				Cancel
			</button>
			<button
				class="modal-button"
				onClick={() => {
					const path = selectedFolder();
					if(path) { props.handleSubmit(path); }
					else     { props.handleCancel();     }
				}}
			>Confirm</button>
		</div>
	</div>);
}
