// noteworthy
import { NoteworthyExtension, NoteworthyExtensionSpec } from "@common/extensions/noteworthy-extension";

export const seedExtensionSpec: NoteworthyExtensionSpec<
	"seed",
	[]
> = {
	name: "seed",
}

////////////////////////////////////////////////////////////////////////////////

export namespace Seed {
	export type Name = "seed";
	export interface Config { };
}

declare module "@common/extensions/noteworthy-extension" {
  export interface CommunityExtensions {
    seed: {
      config: Seed.Config
    }
  }
}

export default class SeedExtension extends NoteworthyExtension<Seed.Name> {

	private _seeds: {
		name: string,
		seed: SeedDoc
	}[];

	constructor() {
		super();

		this._seeds = [];
	}

	updateConfig(updated: Seed.Config): void {
		// extension has no config, do nothing
	}
}


////////////////////////////////////////////////////////////////////////////////

export interface SeedDoc {

}
