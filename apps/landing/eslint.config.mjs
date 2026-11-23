import nx from '@nx/eslint-plugin';
import baseConfig, { webStorageBanAfterReact } from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    ...nx.configs['flat/react'],
    webStorageBanAfterReact,
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        rules: {},
    },
];
