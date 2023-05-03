/**
 * Provides functions to create the global application menu.
 *
 * Currently, Electron does not support dynamic menus, so
 * it is necessary to re-create the entire menu whenever a
 * menu item needs updating.
 *
 * https://github.com/electron/electron/issues/2717
 */


import { MenuItemConstructorOptions } from "electron";
import { is } from "electron-util";
import NoteworthyApp from "@main/app";
import { shell } from "electron";
import { ThemeService } from "@main/theme/theme-service";

////////////////////////////////////////////////////////////

function makeFileMenu(app:NoteworthyApp): MenuItemConstructorOptions {
	/** @todo (9/13/20) don't keep `app` arg in closures!! */
	return {
		label: "File",
		submenu: [
			{
				label: "Open Folder...",
				click: () => { app.handle("dialog", "dialogFolderOpen"); }
			},
			{
				label: "Open File...",
				click: () => { app.handle("dialog", "dialogFileOpen"); }
			},
			{
				type: "separator"
			},
			{
				label: "Save",
				click: () => {
					if(!app._renderProxy){ console.error("no proxy!"); return; }
					app._renderProxy.menuFileSave()
				}
			},
			{
				label: "Save As...",
				click: () => {
					if(!app._renderProxy){ console.error("no proxy!"); return; }
					app._renderProxy.menuFileSaveAs()
				}
			},
			{
				type: "separator"
			},
			{
				label: "Exit",
				click: () => { }
			}
		]
	}
}

function makeViewMenu(): MenuItemConstructorOptions {
	return {
		label: "View",
		submenu: [
			{ role: "reload" },
			{ role: "forceReload" },
			{ role: "toggleDevTools" },
			{ type: "separator" },
			{ role: "resetZoom" },
			{ role: "zoomIn" },
			{ role: "zoomOut" },
			{ type: "separator" },
			{ type: "separator" },
			{ role: "togglefullscreen" }
		]
	};
}

async function makeThemeMenu(themeService:ThemeService): Promise<MenuItemConstructorOptions> {
	// fetch themes
	let themes = await themeService.getThemes();

	let defaultThemeSubmenu: MenuItemConstructorOptions[] = themes.default.map(theme => ({
		label: theme.title,
		click: () => { themeService.setTheme({ type: "default", id: theme.id }); }
	}));

	let customThemeSubmenu: MenuItemConstructorOptions[] = themes.custom.map(theme => ({
		label: theme.title,
		click: () => { themeService.setTheme({ type: "custom", path: theme.path }); }
	}));

	let submenu: MenuItemConstructorOptions[] = [
		{
			label: "Open Themes Folder...",
			click: () => { shell.openPath(themeService.getThemeFolder()); }
		},
		{
			label: "Refresh Custom Themes",
			click: () => { themeService.refreshCustomThemes(); } },
		{ type: "separator" }
	];

	submenu = submenu.concat(
		defaultThemeSubmenu,
		[ { type: "separator" } ],
		customThemeSubmenu,
	);

	return {
		label: "Theme",
		submenu
	};
}

function makeWindowMenu(app:NoteworthyApp): MenuItemConstructorOptions {
	return {
		label: "Window",
		submenu: [
			{ role: "minimize" },
			{
				label: "Close",
				click: () => { app.handle("lifecycle", "requestAppQuit") }
			},
			{ role: "zoom", visible: is.macos }
		]
	};
}

export async function makeAppMenuTemplate(app:NoteworthyApp, themeService:ThemeService): Promise<MenuItemConstructorOptions[]> {
	return [
		makeFileMenu(app),
		makeViewMenu(),
		await makeThemeMenu(themeService),
		makeWindowMenu(app),
	];
}
