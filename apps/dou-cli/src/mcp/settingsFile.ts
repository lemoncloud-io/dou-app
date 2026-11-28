import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defaultSettings, parseSettings } from '@chatic/agent-tools';
import type { Settings } from '@chatic/agent-tools';

export const settingsPath = (profile: string): string => join(profile, 'settings.json');

export const readSettingsFile =
    (profile: string): (() => Settings) =>
    () => {
        try {
            return parseSettings(readFileSync(settingsPath(profile), 'utf8'));
        } catch {
            return defaultSettings();
        }
    };
