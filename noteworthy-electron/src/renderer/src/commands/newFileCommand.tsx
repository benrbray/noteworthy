import { NoteworthyExtensionApi } from "@common/extensions/extension-api";
import { MainIpcHandlers } from "@main/MainIPC";
import { ModalActions } from "@renderer/ui/Modal/modal";
import { ModalNewFile, ModalNewFileProps } from "@renderer/ui/ModalNewFile/ModalNewFile";
import { render } from "solid-js/web";

declare module "@common/commands/commands" {
  export interface InternalCommands {
    newFile: CommandSpec<
			{},
			string|null
		>
  }
}

export const initNewFileCommand = (
	api: NoteworthyExtensionApi,
	mainProxy: MainIpcHandlers
) => {
	api.registerCommand("newFile", async (arg, resolveCommand, rejectCommand) => {
		console.log("[newFile]");

		const workspaceDir = await mainProxy.workspace.currentWorkspaceDir();
		if(!workspaceDir) {
			console.error("cannot create new file when no workspace is open");
			return null;
		}

		const props = (modalActions: ModalActions): ModalNewFileProps => ({
			promptFilePath : async () => {
				return mainProxy.dialog.dialogFileNewPath();
			},
			handleSubmit(name: string) {
				modalActions.close();
				resolveCommand(name);
			},
			handleCancel() {
				modalActions.close();
			},
			workspaceRoot : workspaceDir
		});

		await api.executeCommand("showModal", {
			title: "New File",
			renderModal: (dom, modalActions) => {
				render(() => <ModalNewFile {...props(modalActions)} />, dom);
			}
		});

		// if we reach this point without resolving
		// the promise, no file has been selected
		return null;
	});
}
