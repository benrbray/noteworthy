import NoteworthyApp from "./app";
import FSAL from "./fsal/fsal";
import { makeAppMenuTemplate } from "./menus/app-menu";
import { Menu } from "electron";
import { WorkspaceService } from "./workspace/workspace-service";
import { CrossRefService } from "./plugins/crossref-service";

//// GLOBAL SERVICES ///////////////////////////////////////

/** FSAL: File System Abstraction Layer */
const fsal = new FSAL();
fsal.init();

/** Workspace Service */
const workspaceService = new WorkspaceService(fsal);

/** Tag Service */
const crossRefService = new CrossRefService(workspaceService);

//// APPLICATION ///////////////////////////////////////////

// application state
let app = new NoteworthyApp(
	fsal,
	workspaceService,
	crossRefService
);

// application menu
async function createAppMenu() {
	const appMenuTemplate = await makeAppMenuTemplate(app);
	const appMenu = Menu.buildFromTemplate(appMenuTemplate);
	Menu.setApplicationMenu(appMenu);
}

createAppMenu();


/** @todo (9/12/20) Curtis' suggestion for refactoring App / MainIPC */

// make services....

// let workspaceService = new (...);
// let tagService = new (...);

// make things that depend on services...

// let mainIpcHandlers = new MainIpcHandlers(workspaceService, tagService)