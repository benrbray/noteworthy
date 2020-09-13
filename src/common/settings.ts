/* IMPORT */

import * as os from 'os';
import Store from 'electron-store';
import { darkMode } from 'electron-util';

/* SETTINGS */

/** @todo (9/12/20) dark mode (see `darkMode.isEnabled`) */
export type ThemeId = { type: "default", id:string } | { type: "custom", path:string };

type NoteworthySettings = {
	theme: ThemeId
}

const Settings = new Store<NoteworthySettings>({
	name: '.noteworthy',
	defaults: {
		theme: { type: "default", id: "default-light" }
	}
});

/* EXPORT */

export default Settings;