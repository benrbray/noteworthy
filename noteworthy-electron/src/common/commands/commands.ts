import { CommunityExtensionCommands } from "@common/extensions/noteworthy-extension";

export type RegisteredCommands    = InternalCommands & CommunityExtensionCommands;
export type RegisteredCommandName = keyof RegisteredCommands;
export type RegisteredCommandArg<T extends RegisteredCommandName> = RegisteredCommands[T];

export interface InternalCommands {
	// intentionally empty, to be extended by module declarations
}
