import nx from '@nx/eslint-plugin';

import baseConfig, { webStorageBanAfterReact } from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    ...nx.configs['flat/react'],
    // The preset above sets the rules the root's web-storage ban uses, which would switch the ban
    // off here; this puts it back beside the preset's own lists. The root config says why.
    webStorageBanAfterReact,
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        rules: {
            '@nx/enforce-module-boundaries': 'off',
        },
    },
];
