import { IFileMeta, IFileWithContents } from "@common/files";
import { MainIpcChannel } from "@main/MainIPC";
import NoteworthyApp from "@main/app";
import { FSAL } from "@main/fsal/fsal";
import { WorkspaceService } from "@main/workspace/workspace-service";

////////////////////////////////////////////////////////////

export class MainIpc_FileHandlers implements MainIpcChannel {
	get name() { return "file" as const; }

	constructor(
		private _app: NoteworthyApp,
		private _fsal: FSAL,
		private _workspaceService: WorkspaceService
	){ }

	// -- Request File Create --------------------------- //

	async requestFileCreate(path:string, contents:string=""):Promise<IFileMeta|null> {
		/** @todo (6/26/20) check if path in workspace? */
		return this._workspaceService.createFile(path, contents);
	}

	// -- Request File Save ----------------------------- //

	async requestFileSave(file: IFileWithContents): Promise<boolean> {
		if (!this._app.window) { return false; }

		await this._fsal.saveFile(file.path, file.contents, false);
		/** @todo (7/12/20) check for file save errors? */
		this._app._renderProxy?.fileDidSave({saveas: false, path: file.path });
		return true;
	}

	// -- Request File Open ----------------------------- //

	async requestFileContents(fileInfo: { hash?: string }):Promise<IFileWithContents|null> {
		let { hash } = fileInfo;
		// validate input
		if (hash === undefined) {
			console.error("MainIPC :: requestFileContents() :: no hash provided");
			return null;
		}

		// load from hash
		let fileMeta: IFileMeta | null;
		if (hash === undefined || !(fileMeta = this._workspaceService.getFileByHash(hash))) {
			/** @todo (6/20/20) load from arbitrary path */
			console.log(hash, hash && this._workspaceService.getFileByHash(hash));
			console.error("file loading from arbitrary path not implemented");
			return null;
		}

		// read file contents
		const fileContents: string | null = this._fsal.readFile(fileMeta.path);
		if (fileContents === null) { throw new Error("MainIPC :: failed to read file"); }

		let file: IFileWithContents = {
			parent: null,
			contents: fileContents,
			...fileMeta
		}

		return file;
	}
}
