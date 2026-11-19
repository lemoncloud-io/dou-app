import type { ScenarioConfig } from '@chatic/chatic-apps-devtools';

import { mockData } from './src/mockData';

/**
 * What the scenario runner tries on this page (`chatic-apps scenarios`): the mock answers with the same
 * made-up data the page is developed against, and these are the screens and actions to walk.
 */
const config: ScenarioConfig = {
    data: mockData,
    ready: '[data-action="done"]',
    screens: [
        { name: 'rooms', open: ['[data-action="rooms"]'] },
        { name: 'room', open: ['[data-action="rooms"]', '[data-action="room"]'] },
        { name: 'members', open: ['[data-action="members"]'], tap: ['[data-action="member"]'] },
    ],
    actions: [
        { name: 'count', click: '[data-action="count"]' },
        { name: 'reset', click: '[data-action="reset"]' },
        { name: 'copy', click: '[data-action="copy"]' },
        { name: 'share', click: '[data-action="share"]' },
        { name: 'open-url', click: '[data-action="open-url"]' },
        { name: 'user-key', click: '[data-action="user-key"]' },
        { name: 'camera', click: '[data-action="camera"]' },
    ],
};

export default config;
