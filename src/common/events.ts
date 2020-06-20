export enum FsalEvents {
	WORKSPACE_CHANGED = "fsal-workspace-changed",
	WORKSPACE_SYNC = "fsal-workspace-sync",
	FILETREE_CHANGED = "fsal-filetree-changed",
	STATE_CHANGED = "fsal-state-changed",
	CHOKIDAR_EVENT = "fsal-chokidar-event",
}

export enum UserEvents {
	REQUEST_FILE_SAVE = "request-file-save",
	DIALOG_FILE_SAVEAS = "dialog-file-saveas",
	DIALOG_FILE_OPEN = "dialog-file-open",
	DIALOG_WORKSPACE_OPEN = "dialog-workspace-open",
	REQUEST_FILE_OPEN_HASH = "request-file-open-hash",
	REQUEST_FILE_OPEN_PATH = "request-file-open-path",
}

export enum MenuEvents {
	MENU_FILE_SAVE = "menu-file-save",
	MENU_FILE_SAVEAS = "menu-file-saveas"
}

export enum FileEvents {
	FILE_DID_SAVE = "file-did-save",
	FILE_DID_SAVEAS = "file-did-saveas",
	FILE_DID_OPEN = "file-did-open"
}

// event strings below defined by chokidar
export enum ChokidarEvents {
	ALL = "all",
	ADD_FILE = "add",
	CHANGE_FILE = "change",
	UNLINK_FILE = "unlink",
	ADD_DIR = "addDir",
	UNLINK_DIR = "unlinkDir",
	ERROR = "error",
	READY = "ready"
}

export enum IpcEvents {
	NOTIFY = "notify",
	NOTIFY_ERROR = "notify-error"
}

export enum AppEvents {
	APP_QUIT = "app-quit"
}