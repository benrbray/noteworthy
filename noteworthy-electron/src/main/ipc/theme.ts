import { MainIpcChannel } from "@main/MainIPC";
import { ThemeService } from "@main/theme/theme-service";

export class MainIpc_ThemeHandlers implements MainIpcChannel {

	get name() { return "theme" as const; }

	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(private _themeService:ThemeService){ }

	async requestThemeRefresh() {
		this._themeService.setTheme();
	}
}
