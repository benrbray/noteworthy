import NoteworthyApp from "./app";
import FSALSystem from "./fsal/fsal-system";
import { makeAppMenuTemplate } from "./menus/app-menu";
import { Menu } from "electron";
import { WorkspaceService } from "./workspace/workspace-service";
import { ThemeService } from "./theme/theme-service";
import { PluginService } from "./plugins/plugin-service";

//// GLOBAL SERVICES ///////////////////////////////////////

/** FSAL: File System Abstraction Layer */
const fsal = new FSALSystem();
fsal.init();

/** Workspace Service */
const workspaceService = new WorkspaceService(fsal);
/** Plugin Service */
const pluginService = new PluginService(workspaceService);
/** Theme Service */
const themeService = new ThemeService(fsal);

//// APPLICATION ///////////////////////////////////////////

// application state
let app = new NoteworthyApp(
	fsal,
	workspaceService,
	pluginService,
	themeService
);

// application menu
async function createAppMenu() {
	const appMenuTemplate = await makeAppMenuTemplate(app, themeService);
	const appMenu = Menu.buildFromTemplate(appMenuTemplate);
	Menu.setApplicationMenu(appMenu);
}

createAppMenu();