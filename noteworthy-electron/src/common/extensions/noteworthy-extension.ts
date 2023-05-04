import { NoteworthyExtensionApi } from "@renderer/extensions/extension-api";
import * as PS from "prosemirror-state";

////////////////////////////////////////////////////////////////////////////////

export interface NoteworthyExtensionSpec<Name extends RegisteredExtensionName, Deps extends RegisteredExtensionName[] = []> {
	name: Name;
	config?: { [D in Deps[number]] ?: CommunityExtensionConfig[D] };
}

////////////////////////////////////////////////////////////////////////////////

/** https://stackoverflow.com/a/69756175/1444650 */
// type PickByType<T, Value> = {
//   [P in keyof T as T[P] extends Value | undefined ? P : never]: T[P]
// }

// interface HasName { name: string }

export type RegisteredExtensions    = CommunityExtensions; //PickByType<CommunityExtensions, HasName>
export type RegisteredExtensionName = keyof RegisteredExtensions


// mapping from Name -> Config
type CommunityExtensionConfig = {
	[P in keyof RegisteredExtensions] ?: RegisteredExtensions[P] extends { config: unknown } ? RegisteredExtensions[P]["config"] : never
}

export interface CommunityExtensions {
	ignore: number,
	fooExtension: {
		name: "fooExtension",
		config: {
			logger: (lang: string) => HTMLElement
		}
	},
	barExtension: {
		name: "barExtension"
	},
	bazExtension: {
		name: string
	}
}

////////////////////////////////////////////////////////////////////////////////

export abstract class NoteworthyExtension<
	Name extends RegisteredExtensionName,
	Deps extends RegisteredExtensionName[] = [],
> {

	constructor() { }

	/**
	 * Update the existing configuration with a new value.
	 * It is up to the extension to decide whether to:
	 *   1. completely replace the old value
	 *   2. merge the old and new values
	 */
	abstract updateConfig(updated: NonNullable<CommunityExtensionConfig[Name]>): void;

	/**
	 * Return a set of [plugins](https://prosemirror.net/docs/ref/#state.Plugin_System)
	 * to be attached to the editor's ProseMirror instance.
	 *
	 * Called *after* all extensions have been initialized and their configs updated.
	 */
	makeProseMirrorPlugins(): PS.Plugin[] { return []; }
}

////////////////////////////////////////////////////////////////////////////////

export interface NoteworthyExtensionInitializer<
	Name extends RegisteredExtensionName = RegisteredExtensionName,
	Deps extends RegisteredExtensionName[] = []
> {
	spec: NoteworthyExtensionSpec<Name, Deps>
	initialize: (state: {
		editorElt: HTMLElement,
		api: NoteworthyExtensionApi
	}) => NoteworthyExtension<Name, Deps>
}
