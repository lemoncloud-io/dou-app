import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';

import type { StorybookConfig } from '@storybook/react-vite';

import autoprefixer from 'autoprefixer';
import tailwind from 'tailwindcss';

const here = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
    stories: [
        '../src/**/*.@(mdx|stories.@(js|jsx|ts|tsx))',
        '../../design-system/components/mobile/src/**/*.@(mdx|stories.@(js|jsx|ts|tsx))',
        '../../design-system/patterns/mobile/src/**/*.@(mdx|stories.@(js|jsx|ts|tsx))',
        '../../design-system/chat/mobile/src/**/*.@(mdx|stories.@(js|jsx|ts|tsx))',
    ],
    addons: [],
    framework: {
        name: getAbsolutePath('@storybook/react-vite'),
        options: {},
    },

    viteFinal: async config =>
        mergeConfig(config, {
            plugins: [react(), nxViteTsPaths()],
            css: {
                postcss: {
                    plugins: [tailwind(join(here, '../tailwind.config.js')), autoprefixer()],
                },
            },
        }),
};

function getAbsolutePath(value: string): any {
    return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

export default config;
