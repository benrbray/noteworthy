import { NoteworthyExtensionInitializer } from "@common/extensions/noteworthy-extension";
import SeedExtension, { Seed, seedExtensionSpec } from "./seed-extension";

////////////////////////////////////////////////////////////////////////////////

declare module "@common/extensions/noteworthy-extension" {
  export interface CommunityExtensionCommands {
    seedNew: { seedName : string }
  }
}

////////////////////////////////////////////////////////////////////////////////

export const seedExtension: NoteworthyExtensionInitializer<
	Seed.Name, // extension name
	[]         // dependencies
> = {
	spec: seedExtensionSpec,

	initialize({ api }) {
		// api.registerCommand("seedNew", async ({ seedName }) => {
		// 	console.log(`create seed (name: ${seedName})`);
		// });

		return new SeedExtension();
	}
}

export default seedExtension;
