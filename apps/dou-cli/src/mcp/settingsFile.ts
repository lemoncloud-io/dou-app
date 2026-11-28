import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defaultSettings, parseSettings } from '@chatic/agent-tools';
import type { Settings } from '@chatic/agent-tools';

export const settingsPath = (profile: string): string => join(profile, 'settings.json');

export const readSettingsFile =
    (profile: string): (() => Settings) =>
    () => {
        let text: string;
        try {
            text = readFileSync(settingsPath(profile), 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultSettings();
            return { ...defaultSettings(), tier: 'off' };
        }
        try {
            JSON.parse(text);
        } catch {
            return { ...defaultSettings(), tier: 'off' };
        }
        return parseSettings(text);
    };
