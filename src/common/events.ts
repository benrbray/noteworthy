export const FsalEvents = {
	WORKSPACE_CHANGED: "fsal-workspace-changed",
	WORKSPACE_SYNC: "fsal-workspace-sync",
	FILETREE_CHANGED: "fsal-filetree-changed",
	STATE_CHANGED: "fsal-state-changed",
	CHOKIDAR_EVENT : "fsal-chokidar-event",
}

export const MainEvents = {
}

export const UserEvents = {
	REQUEST_FILE_SAVE : "request-file-save",
	DIALOG_FILE_SAVEAS : "dialog-file-saveas",
	DIALOG_FILE_OPEN : "dialog-file-open",
	DIALOG_WORKSPACE_OPEN : "dialog-workspace-open"
}

export const FileEvents = {
	FILE_DID_SAVE : "file-did-save",
	FILE_DID_SAVEAS : "file-did-saveas",
	FILE_DID_OPEN : "file-did-open"
}

export const IpcEvents = {
	NOTIFY : "notify",
	NOTIFY_ERROR : "notify-error"
}

export const AppEvents = {
	APP_QUIT : "app-quit"
}