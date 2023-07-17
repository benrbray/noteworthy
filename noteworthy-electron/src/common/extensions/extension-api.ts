import { RegisteredCommandArg, RegisteredCommandName } from "@common/commands/commands";

export type TagSearchResult = {
	/** tag name **/
	result: string,
	/** tag name, split into named chunks to reflect alignment with a query **/
	resultEmphasized: { text: string, emph?: boolean }[];
}

export interface NoteworthyExtensionApi {
	fuzzyTagSearch(query: string): Promise<TagSearchResult[]>;

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
