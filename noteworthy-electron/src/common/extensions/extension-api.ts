import { RegisteredCommandArg, RegisteredCommandName } from "@common/commands/commands";
import { FileHash } from "@common/files";

export type TagSearchResult = {
	/** tag name **/
	result: string,
	/** tag name, split into named chunks to reflect alignment with a query **/
	resultEmphasized: { text: string, emph?: boolean }[];
}

export interface NoteworthyExtensionApi {
	fuzzyTagSearch(query: string): Promise<TagSearchResult[]>;

	/**
	 * Opens the file creation modal, and returns once the modal has been submitted.
	 * @returns File hash of the created file, if successful.
	 */
	createFileViaModal(): Promise<null | FileHash>;

	// use at initialization time only
	registerCommand<C extends RegisteredCommandName>(
		commandName: C,
		handler: (arg: RegisteredCommandArg<C>) => Promise<void>
	): void;

	executeCommand<C extends RegisteredCommandName>(
		commandName: C,
		arg: RegisteredCommandArg<C>
	): Promise<void>;
}
