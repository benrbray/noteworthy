import { IFileMeta, getFileMetadata } from "@common/files";
import { MainIpcChannel } from "@main/MainIPC";
import NoteworthyApp from "@main/app";
import { PluginService } from "@main/plugins/plugin-service";
import { WorkspaceService } from "@main/workspace/workspace-service";

////////////////////////////////////////////////////////////

export class MainIpc_NavigationHandlers implements MainIpcChannel {

	get name() { return "navigation" as const; }

	// TODO (2021/03/12) clear navigation history on workspace open/close
	private _navHistory: IFileMeta[];
	private _navIdx: number;

	constructor(
		private _app:NoteworthyApp,
		private _workspaceService: WorkspaceService,
		private _pluginService: PluginService
	) {
		this._navHistory = [];
		this._navIdx = 0;
	}

	/**
	 * @returns Metadata for the opened file, if successful, otherwise null
	 */
	private async _navigate(fileInfo: { hash: string }): Promise<IFileMeta | null> {
		console.log(`MainIPC_NavigationHandlers :: navigate :: ${ fileInfo.hash }`);

		// get file contents
		// @todo (2022/03/04) avoid private access to _eventHandlers? or make public?
		let file = await this._app._eventHandlers.file.requestFileContents(fileInfo);
		if(!file){ return null; }

		// send file to render process
		this._app._renderProxy?.fileDidOpen(file);

		// return
		return getFileMetadata(file);
	}

	public getNavigationHistory() {
		return {
			history: [...this._navHistory],
			currentIdx: this._navIdx
		}
	}

	public navigateNext(): void {
		// clamp to guarantee valid output index, even if we receive invalid input
		let nextIdx: number = Math.min(Math.max(this._navIdx, 0), this._navHistory.length);

		// search forwards through history for next valid index
		let foundValid: boolean = false;
		while(nextIdx + 1 < this._navHistory.length){
			nextIdx = nextIdx + 1;
			if(this._workspaceService.getFileByHash(this._navHistory[nextIdx].hash)) {
				foundValid = true;
				break;
			}
		}

		// do nothing if no valid files found
		if(!foundValid || nextIdx === this._navIdx) { return; }

		// navigate
		let file = this._navigate({ hash: this._navHistory[nextIdx].hash });
		if(!file) { return; }
		this._navIdx = nextIdx;

		// TODO (2021/03/12) re-think updates to reactive ui data
		this._app._renderProxy?.navHistoryChanged({ history: this._navHistory, currentIdx: this._navIdx });
	}

	public navigatePrev(): void {
		// clamp to guarantee valid output index, even if we receive invalid input
		let prevIdx: number = Math.min(Math.max(this._navIdx, 0), this._navHistory.length);

		// search forwards through history for next valid index
		let foundValid: boolean = false;
		while(prevIdx - 1 > 0){
			prevIdx = prevIdx - 1;
			if(this._workspaceService.getFileByHash(this._navHistory[prevIdx].hash)) {
				foundValid = true;
				break;
			}
		}

		// do nothing if no valid files found
		if(!foundValid || prevIdx === this._navIdx) { return; }

		// navigate
		let file = this._navigate({ hash: this._navHistory[prevIdx].hash });
		if(!file) { return; }
		this._navIdx = prevIdx;

		// TODO (2021/03/12) re-think updates to reactive ui data
		this._app._renderProxy?.navHistoryChanged({ history: this._navHistory, currentIdx: this._navIdx });
	}

	async navigateToHash(fileInfo: { hash: string }): Promise<void> {
		if (!this._app.window) { return; }

		// request file contents
		let file = await this._navigate(fileInfo);
		if(!file){ return; }

		// push this file onto navigation stack, erasing any existing forward history
		this._navHistory.splice(this._navIdx+1, this._navHistory.length-this._navIdx+1, file);
		this._navIdx = this._navHistory.length - 1;

		// TODO (2021/03/12) re-think updates to reactive ui data
		this._app._renderProxy?.navHistoryChanged({ history: this._navHistory, currentIdx: this._navIdx });
	}

	async navigateToTag(data:{tag: string, create:boolean, directoryHint?:string}):Promise<void> {
		if (!this._app.window) { return; }

		// get files which define this tag
		// @todo (2022/03/04) avoid private access to _eventHandlers? or make public?
		let fileHash = await this._app._eventHandlers.tag.getHashForTag(data);
		if(!fileHash) return;
		// load file from hash
		this.navigateToHash({ hash: fileHash });
	}

	async navigateToIndex(idx: number): Promise<undefined> {
		if(idx < 0 || idx >= this._navHistory.length) {
			return Promise.reject("MainIpc_NavigationHandlers :: navigateToIndex :: index out of bounds");
		}

		this._navigate({ hash: this._navHistory[idx].hash });
		this._navIdx = idx;

		// TODO (2021/03/12) re-think updates to reactive ui data
		this._app._renderProxy?.navHistoryChanged({ history: this._navHistory, currentIdx: this._navIdx });

    // required by tsconfig `noImplicitReturns`
    return;
	}
}
