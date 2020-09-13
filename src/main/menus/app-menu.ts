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
import Settings from "@common/settings";

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
				label: "Close All",
				click: () => { }
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
			{	label: "Export File...",
				submenu: [
					{ label: "PDF" },
					{ label: "HTML" },
					{ label: "HTML (without styles)" },
					{ type: "separator" },
					{ label: "LaTeX" },
					{ label: "Word" },
					{ label: "OpenOffice" },
					{ label: "RTF" },
					{ label: "epub" },
					{ type: "separator" },
					{ label: "Export Options..." },
				]
			},
			{	label: "Export Workspace...",
				submenu: [
					{ label: "HTML" },
					{ label: "HTML (without styles)" },
					{ label: "LaTeX" },
					{ type: "separator" },
					{ label: "Export Options..." },
				]
			},
			{
				label: "Exit",
				click: () => { }
			}
		]
	}
}

function makeEditMenu(): MenuItemConstructorOptions {
	return {	
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "pasteAndMatchStyle" },
			{ role: "delete" },
			{ type: "separator" },
			{ label: "Copy as Markdown" },
			{ label: "Copy as Text" },
			{ label: "Copy as HTML" },
			{ type: "separator" },
			{ role: "selectAll" },
		]
	}
}

function makeParagraphMenu(): MenuItemConstructorOptions {
	return {
		label: "Paragraph",
		submenu: [
			{ label: "TODO" },
		]
	};
}

function makeViewMenu(): MenuItemConstructorOptions {
	return { 
		label: "View",
		submenu: [
			{ label: "Toggle Sidebar" },
			{ label: "Document Outline" },
			{ label: "File Tree View" },
			{ label: "File List View" },
			{ type: "separator" },
			{ role: "reload" },
			{ role: "forceReload" },
			{ role: "toggleDevTools" },
			{ type: "separator" },
			{ role: "resetZoom" },
			{ role: "zoomIn" },
			{ role: "zoomOut" },
			{ type: "separator" },
			{ label: "Toggle Side Panel" },
			{ label: "Focus Mode" },
			{ label: "Typewriter Mode" },
			{ type: "separator" },
			{ role: "togglefullscreen" }
		]
	};
}

async function makeThemeMenu(app:NoteworthyApp): Promise<MenuItemConstructorOptions> {
	// fetch themes
	let themes = await app.getThemes();

	let defaultThemeSubmenu: MenuItemConstructorOptions[] = themes.default.map(theme => ({
		label: theme.title,
		click: () => { app.setTheme({ type: "default", id: theme.id }); }
	}));

	let customThemeSubmenu: MenuItemConstructorOptions[] = themes.custom.map(theme => ({
		label: theme.title,
		click: () => { app.setTheme({ type: "custom", path: theme.path }); }
	}));

	let submenu: MenuItemConstructorOptions[] = [
		{
			label: "Open Themes Folder...",
			click: () => { shell.openPath(app.getThemeFolder()); }
		},
		{ label: "Refresh Custom Themes" },
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

function makeHelpMenu(): MenuItemConstructorOptions {
	return {
		label: "Help",
		submenu: [
			{
				label: "About Noteworthy",
				click: () => console.log("about")
			},{
				label: "View Documentation",
				click: () => console.error("unhandled menu option!")
			},
			{ type: "separator" },
			{
				label: "Report a Problem...",
				click: () => console.error("unhandled menu option!")
			},{
				label: "Submit Feature Request...",
				click: () => console.error("unhandled menu option!")
			}
		]
	};
}

export async function makeAppMenuTemplate(app:NoteworthyApp): Promise<MenuItemConstructorOptions[]> {
	return [
		makeFileMenu(app),
		makeEditMenu(),
		makeParagraphMenu(),
		makeViewMenu(),
		await makeThemeMenu(app),
		makeWindowMenu(app),
		makeHelpMenu()
	];
}