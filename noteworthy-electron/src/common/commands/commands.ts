import { CommunityExtensionCommands } from "@common/extensions/noteworthy-extension";

export type RegisteredCommands    = InternalCommands & CommunityExtensionCommands;
export type RegisteredCommandName = keyof RegisteredCommands;

export type CommandSpec<A, R> = { arg : A , result : R }

export type CommandArg<T extends RegisteredCommandName> =
	RegisteredCommands[T] extends CommandSpec<infer A, infer R> ? A : never;

export type CommandResult<T extends RegisteredCommandName> =
	RegisteredCommands[T] extends CommandSpec<infer A, infer R> ? R : never;

export type CommandHandler<C extends RegisteredCommandName> = (
		arg: CommandArg<C>,
		resolveCommand: (result: CommandResult<C>) => void,
		rejectCommand: () => void
	) => Promise<CommandResult<C>>;

export interface InternalCommands {
	// intentionally empty, to be extended by module declarations
}
