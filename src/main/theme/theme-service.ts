// project imports
import { Settings } from "@common/settings";

// electron imports
import { app } from "electron";

// node.js imports
import * as pathlib from "path";
import { promises as fs } from "fs";
import { EventEmitter } from "events";

// defined by electron-webpack
declare const __static:string;

export enum ThemeEvent {
	THEME_CHANGED = "theme-changed"
}

////////////////////////////////////////////////////////////

export type ThemeId = { type: "default", id:string } | { type: "custom", path:string };

export class ThemeService extends EventEmitter {
	constructor(){ super(); }

	async setTheme(theme:ThemeId|null = null) {
		// use current theme if none provided
		if(theme == null){ theme = Settings.get("theme"); }

		// default vs custom themes
		if(theme.type == "default"){
			// find default theme
			/** @todo (9/12/20) this should be done elsewhere, refactor theme stuff into its own file */
			let themeCssPath:string = "";
			switch(theme.id){
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