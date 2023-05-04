// electron
import { app, shell, BrowserWindow, Menu } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// node
import { join } from 'path'

// noteworthy
import NoteworthyApp from './app';
import FSALSystem from './fsal/fsal-system';
import { WorkspaceService } from './workspace/workspace-service';
import { PluginService } from './plugins/plugin-service';
import { ThemeService } from './theme/theme-service';
import { makeAppMenuTemplate } from "./menus/app-menu";

// assets
import icon from '../../resources/icon.png?asset'

////////////////////////////////////////////////////////////////////////////////

async function createAppMenu(app: NoteworthyApp, themeService: ThemeService) {
	const appMenuTemplate = await makeAppMenuTemplate(app, themeService);
	const appMenu = Menu.buildFromTemplate(appMenuTemplate);
	Menu.setApplicationMenu(appMenu);
}

////////////////////////////////////////////////////////////////////////////////

function createNoteworthy(): NoteworthyApp {
	/** FSAL: File System Abstraction Layer */
	const fsal = new FSALSystem();
	fsal.init();

	const workspaceService = new WorkspaceService(fsal);
	const pluginService = new PluginService(workspaceService);
	const themeService = new ThemeService(fsal);

	const app = new NoteworthyApp(
		fsal,
		workspaceService,
		pluginService,
		themeService
	);

	createAppMenu(app, themeService);

	return app;
}

////////////////////////////////////////////////////////////////////////////////

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createNoteworthy();

  // app.on('activate', function () {
  //   // On macOS it's common to re-create a window in the app when the
  //   // dock icon is clicked and there are no other windows open.
  //   if (BrowserWindow.getAllWindows().length === 0) createWindow()
  // })
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
