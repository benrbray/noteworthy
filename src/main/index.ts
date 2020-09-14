import NoteworthyApp from "./app";
import FSAL from "./fsal/fsal";
import { makeAppMenuTemplate } from "./menus/app-menu";
import { Menu } from "electron";
import { WorkspaceService } from "./workspace/workspace-service";
import { CrossRefService } from "./plugins/crossref-service";
import { ThemeService } from "./theme/theme-service";

//// GLOBAL SERVICES ///////////////////////////////////////

/** FSAL: File System Abstraction Layer */
const fsal = new FSAL();
fsal.init();

/** Workspace Service */
const workspaceService = new WorkspaceService(fsal);
/** Tag Service */
const crossRefService = new CrossRefService(workspaceService);
/** Theme Service */
const themeService = new ThemeService();

//// APPLICATION ///////////////////////////////////////////

// application state
let app = new NoteworthyApp(
	fsal,
	workspaceService,
	crossRefService,
	themeService
);

// application menu
async function createAppMenu() {
	const appMenuTemplate = await makeAppMenuTemplate(app, themeService);
	const appMenu = Menu.buildFromTemplate(appMenuTemplate);
	Menu.setApplicationMenu(appMenu);
}

createAppMenu();