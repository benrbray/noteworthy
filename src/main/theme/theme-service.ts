// project imports
import { Settings } from "@common/settings";

// electron imports
import { app } from "electron";

// node.js imports
import * as pathlib from "path";
import { promises as fs } from "fs";
import { EventEmitter } from "events";
import { FSAL } from "@main/fsal/fsal";
import { FsalEvents, ChokidarEvents } from "@common/events";

// defined by electron-webpack
declare const __static:string;

export enum ThemeEvent {
	THEME_CHANGED = "theme-changed"
}

/** @todo (9/14/20) respond to darkMode.onChange events from eletron-util */

////////////////////////////////////////////////////////////

export type ThemeId = { type: "default", id:string } | { type: "custom", path:string };

export class ThemeService extends EventEmitter {
	constructor(private _fsal: FSAL){ 
		super();
		this.initThemeFolder();
	}

	// == Lifecycle ===================================== //

	async initThemeFolder(){
		// ensure theme folder exists
		let themeFolder = this.getThemeFolder();
		fs.mkdir(themeFolder)
			.then(()=>  { console.log("app :: theme folder created at", themeFolder);        })
			.catch(()=> { console.log("app :: theme folder already exists at", themeFolder); });

		// watch for changes
		this._fsal.watchGlobal(themeFolder);
		this._fsal.addListener(FsalEvents.GLOBAL_CHOKIDAR_EVENT, (event:ChokidarEvents, info:{ path:string })=>{
			console.log("theme-service :: chokidar event");
			if(info.path.startsWith(themeFolder)){
				console.log("theme-service :: Theme Folder Changed!");
				this.refreshCustomThemes();
			}
		});
	}

	// == Theme Configuration =========================== //

	async refreshCustomThemes(){
		/** @todo (9/14/20) refresh theme folder list and emit event which triggers re-creation of application menu */
		this.refreshTheme();
	}

	async refreshTheme(){
		this.setTheme(null);
	}

	async setTheme(theme:ThemeId|null = null) {
		// use current theme if none provided
		if(theme == null){ theme = Settings.get("theme"); }

		// default vs custom themes
		if(theme.type == "default"){
			// find default theme
			let themeCssPath:string = "";
			switch(theme.id){
				/** @todo (9/14/20) these should be defined elsewhere */
				case "default-dark"  : themeCssPath = pathlib.resolve(__static, 'themes/theme-default-dark.css');  break;
				case "default-light" : themeCssPath = pathlib.resolve(__static, 'themes/theme-default-light.css'); break;
				case "typewriter-light" : themeCssPath = pathlib.resolve(__static, 'themes/theme-typewriter-light.css'); break;
				case "academic-light" : themeCssPath = pathlib.resolve(__static, 'themes/theme-academic-light.css'); break;
				default: console.error(`theme '${theme.id}' not found`); return;
			}

			// read and apply theme
			let cssString:string = await fs.readFile(themeCssPath, { encoding : 'utf8' });
			this.emit(ThemeEvent.THEME_CHANGED, cssString);

			// save theme to user settings
			Settings.set("theme", theme);
		} else if(theme.type == "custom"){
			// read and apply theme
			let cssString:string = await fs.readFile(theme.path, { encoding : 'utf8' });
			this.emit(ThemeEvent.THEME_CHANGED, cssString);
			// save theme to user settings
			Settings.set("theme", theme);
		}
	}

	getThemeFolder(): string {
		/** @todo (9/12/20)
		 * userData folder is different in develop vs production,
		 * still need to test that this works in production
		 */
		return pathlib.join(app.getPath("userData"), "themes");
	}

	async getThemes() {
		return {
			"default" : [
				{ title: "Default Light", id: "default-light" },
				{ title: "Default Dark",  id: "default-dark" },
				{ title: "Typewriter Light",  id: "typewriter-light" },
				{ title: "Academic Light",  id: "academic-light" },
			],
			"custom" : await this.getCustomThemes()
		};
	}

	async getCustomThemes(): Promise<{ title:string, path:string }[]> {
		// attempt to read themes folder, but fail gracefully when it does not exist
		let themeFolder = this.getThemeFolder();

		let filePaths:string[] = [];
		try { 
			filePaths = await fs.readdir(themeFolder);
		} catch(err){
			console.error("themes folder does not exist\n", err);
		}

		// filter .css files
		return filePaths
			.filter(fileName => (pathlib.extname(fileName)==".css"))
			.map(fileName => {
				let path = pathlib.join(themeFolder, fileName);
				return ({ title: fileName, path: path })
			});
	}
}