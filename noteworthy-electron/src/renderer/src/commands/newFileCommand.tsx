import { NoteworthyExtensionApi } from "@common/extensions/extension-api";

declare module "@common/extensions/noteworthy-extension" {
  export interface CommunityExtensionCommands {
    newFile: {},
  }
}

export const initNewFileCommand = (
	api: NoteworthyExtensionApi
) => {
	api.registerCommand("newFile", async () => {
		console.log("[initNewFileCommand]");
	});
}
