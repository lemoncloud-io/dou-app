/// <reference types='vitest' />
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import svgr from 'vite-plugin-svgr';

import webPkg from './package.json' with { type: 'json' };

const removeVitePrefix = (envVar: string) => envVar.replace('VITE_', '');

const htmlEnvInjectionPlugin = () => {
    return {
        name: 'html-env-injection',
        transformIndexHtml(html: string) {
            const envVars = Object.entries(process.env)
                .filter(([key]) => key.startsWith('VITE_'))
                .reduce(
                    (acc, [key, value]) => {
                        acc[removeVitePrefix(key)] = value || '';
                        return acc;
                    },
                    {} as Record<string, string>
                );

            const envScript = `
                <script>
                    (function() {
                        ${Object.entries(envVars)
                            .map(([key, value]) => `window.${key}="${value}";`)
                            .join('\n')}
                    })();
                </script>
            `;

            return html.replace(/<body>/, `${envScript}\n<body>`);
        },
    };
};

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/web',

    optimizeDeps: {
        exclude: ['react-native'],
    },

    define: {
        'process.env': {},
        'process.env.I18N_VERSION': JSON.stringify(Date.now().toString()),
        __APP_VERSION__: JSON.stringify(webPkg.version),
        ...(process.env.NODE_ENV === 'development'
            ? {
                  global: 'window',
                  'process.env.I18N_VERSION': JSON.stringify('dev'),
              }
            : {}),
    },

    resolve: {
        alias: {
            '@chatic/assets': '/assets/src/index.ts',
            'react-native': 'react-native-web',
            ...(process.env.NODE_ENV !== 'development'
                ? {
                      './runtimeConfig': './runtimeConfig.browser',
                  }
                : {}),
        },
    },

    server: {
        port: 5003,
        host: 'localhost',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd()), searchForWorkspaceRoot(process.cwd()) + '../../../assets'],
        },
    },

    preview: {
        port: 5003,
        host: 'localhost',
    },

    plugins: [htmlEnvInjectionPlugin(), svgr(), react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

    build: {
        sourcemap: process.env.VITE_ENV !== 'PROD',
        minify: 'terser',
        outDir: '../../dist/apps/web',
        emptyOutDir: true,
        reportCompressedSize: true,
        commonjsOptions: {
            include: [/node_modules/],
            extensions: ['.js', '.cjs'],
            strictRequires: true,
            transformMixedEsModules: true,
        },
    },

    css: {
        modules: {
            localsConvention: 'camelCase',
        },
    },

    test: {
        globals: true,
        cache: {
            dir: '../../node_modules/.vitest',
        },
        environment: 'jsdom',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
        coverage: {
            reportsDirectory: '../../coverage/apps/web',
            provider: 'v8',
        },
    },
});
