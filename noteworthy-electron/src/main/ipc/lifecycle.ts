import { to } from "@common/util/to";
import { MainIpcChannel } from "@main/MainIPC";
import NoteworthyApp from "@main/app";

////////////////////////////////////////////////////////////

export class MainIpc_LifecycleHandlers implements MainIpcChannel {

	get name() { return "lifecycle" as const; }

	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(private _app:NoteworthyApp){ }

	// -- Quit ------------------------------------------ //

	async requestAppQuit():Promise<void>{
		/** @todo (7/12/20) handle multiple windows? multiple files open? */
		if(this._app._renderProxy){
			// attempt to close active editors/windows
			let [err, result] = await to<string>(this._app._renderProxy.requestClose());
			// ok if promise rejects because user cancelled shutdown
			if(err == "Cancel"){ return; }
			// anything else is an error
			else if(err){ return Promise.reject(err); }
		}
		// close app
		this._app.quit();
	}
}
