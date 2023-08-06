import { MainIpcChannel } from "@main/MainIPC";
import NoteworthyApp from "@main/app";
import { WorkspaceService } from "@main/workspace/workspace-service";
import { dialog } from "electron";
import { MainIpc_DialogHandlers } from "./dialog";

export class MainIPC_WorkspaceHandlers implements MainIpcChannel {

	get name() { return "workspace" as const; }

	constructor(
		private _app: NoteworthyApp,
		private _workspaceService: WorkspaceService,
		private _dialogHandlers: MainIpc_DialogHandlers,
	) { }

	async selectWorkspace() {
		if (!this._app.window) { return; }

		// open file dialog
		const dirPaths: string[] | undefined = dialog.showOpenDialogSync(
			this._app.window.window,
			{
				properties: ['openDirectory', 'createDirectory'],
				//filters: FILE_FILTERS
			}
		);
		if (!dirPaths || !dirPaths.length) return;

		this._workspaceService.setWorkspaceDir(dirPaths[0]);
	}

	async newFilePrompt() {
		const newFilePath = await this._dialogHandlers.dialogFileNewPath();

		// create and open new file
		let newFile = await this._workspaceService.createFile(newFilePath, "");
		if(!newFile) { return Promise.reject("failed to create new file"); }

		return this._app._eventHandlers.navigation.navigateToHash({ hash: newFile.hash });
	}

}
