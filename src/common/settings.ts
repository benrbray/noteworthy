// electron imports
import Store from 'electron-store';
import { darkMode } from 'electron-util';

// project imports
import { ThemeId } from '@main/theme/theme-service';

////////////////////////////////////////////////////////////

/** @todo (9/12/20) dark mode (see `darkMode.isEnabled`) */
export type NoteworthySettings = {
	theme: ThemeId
}

export const Settings = new Store<NoteworthySettings>({
	name: '.noteworthy',
	defaults: {
		theme: { type: "default", id: "default-light" }
	}
});