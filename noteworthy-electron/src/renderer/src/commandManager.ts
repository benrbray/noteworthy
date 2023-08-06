import { CommandHandler, CommandArg, RegisteredCommandName, CommandResult } from "@common/commands/commands";

export interface CommandEvents {
	commandsChanged: { }
}

export class CommandManager {

	private _registeredCommands
		= new Map<
				RegisteredCommandName,
				(arg: any, resolveCommand: (result: any) => void, rejectCommand: () => void) => Promise<unknown>
			>();

	// internal services can subscribe to events which report changes to the list of commands
	private _eventHandlers: { [E in keyof CommandEvents] : ((arg: CommandEvents[E]) => void)[] }
		= { commandsChanged: [] };

	constructor (
	) {

	}

	getCommandNames(): RegisteredCommandName[] {
		return Array.from(this._registeredCommands.keys());
	}

	registerCommand<C extends RegisteredCommandName>(
		name: C,
		command: CommandHandler<C>
	): void {
		if(this._registeredCommands.has(name)) {
			console.error(`command ${name} already registered`);
		}

		this._registeredCommands.set(name, command);

		// emit events
		this._emitEvent("commandsChanged", {});
	}

	async executeCommand<C extends RegisteredCommandName>(
		name: C,
		arg: CommandArg<C>
	): Promise<CommandResult<C>> {
		const command = this._registeredCommands.get(name);

		if(!command) {
			console.error(`unknown command ${name}`);
			return Promise.reject();
		}

		return new Promise((resolveCommand, rejectCommand) => {
			return command(arg, resolveCommand, rejectCommand);
		});
	}

	/* ---- event emitter --------------------------------- */

	private async _emitEvent<E extends keyof CommandEvents>(
		event: E,
		arg: CommandEvents[E]
	): Promise<void> {
		this._eventHandlers[event].forEach((handler) => {
			handler(arg);
		});
	}

	on<E extends keyof CommandEvents>(event: E, handler: (arg: CommandEvents[E]) => void) {
		this._eventHandlers[event].push(handler);
	}


}
