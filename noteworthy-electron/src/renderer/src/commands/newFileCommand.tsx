import { NoteworthyExtensionApi } from "@common/extensions/extension-api";

declare module "@common/commands/commands" {
  export interface InternalCommands {
    newFile: CommandSpec<
			{},
			string
		>
  }
}

export const initNewFileCommand = (
	api: NoteworthyExtensionApi
) => {
	api.registerCommand("newFile", async () => {
		console.log("[initNewFileCommand]");
		return "todo"; // TODO (Ben @ 2023/08/06)
	});
}
