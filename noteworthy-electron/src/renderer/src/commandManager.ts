import { RegisteredCommandArg, RegisteredCommandName } from "@common/commands/commands";

export interface CommandEvents {
	commandsChanged: { }
}

export class CommandManager {

	private _registeredCommands: Map<RegisteredCommandName, (arg: any) => Promise<void>>
		= new Map<RegisteredCommandName, (arg: any) => Promise<void>>();

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
		command: (arg: RegisteredCommandArg<C>) => Promise<void>
	): void {
		if(this._registeredCommands.has(name)) {
			console.error(`command ${name} already registered`);
		}

		this._registeredCommands.set(name, command);

		// emit events
		this._emitEvent("commandsChanged", {});
	}

	async executeCommand<C extends RegisteredCommandName>(name: C, arg: RegisteredCommandArg<C>): Promise<void> {
		const command = this._registeredCommands.get(name);

		if(!command) {
			console.error(`unknown command ${name}`);
			return;
		}

		await command(arg);
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
