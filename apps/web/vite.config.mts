/// <reference types='vitest' />
import * as fs from 'fs';
import * as path from 'path';

import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import svgr from 'vite-plugin-svgr';

import webPkg from './package.json' with { type: 'json' };

const copySharedPublicPlugin = () => {
    const sharedPublicDir = path.resolve(import.meta.dirname, '../../assets/public');
    return {
        name: 'copy-shared-public',
        configureServer(server: { middlewares: { use: (middleware: unknown) => void } }) {
            server.middlewares.use((req: { url?: string }, res: { end: (data: Buffer) => void }, next: () => void) => {
                if (!req.url) return next();
                const filePath = path.join(sharedPublicDir, req.url);
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    res.end(fs.readFileSync(filePath));
                } else {
                    next();
                }
            });
        },
        writeBundle() {
            const outDir = path.resolve(import.meta.dirname, '../../dist/apps/web');
            if (fs.existsSync(sharedPublicDir)) {
                fs.readdirSync(sharedPublicDir).forEach(file => {
                    fs.copyFileSync(path.join(sharedPublicDir, file), path.join(outDir, file));
                });
            }
        },
    };
};

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

            // Preconnect links for API endpoints
            const preconnectKeys = ['VITE_OAUTH_ENDPOINT', 'VITE_DOU_ENDPOINT'];
            const preconnectTags = preconnectKeys
                .map(key => process.env[key])
                .filter((url): url is string => !!url)
                .map(url => {
                    try {
                        return new URL(url).origin;
                    } catch {
                        return null;
                    }
                })
                .filter((origin): origin is string => !!origin)
                .filter((origin, i, arr) => arr.indexOf(origin) === i)
                .map(origin => `<link rel="preconnect" href="${origin}" crossorigin />`)
                .join('\n');

            html = html.replace(/<body>/, `${envScript}\n<body>`);

            if (preconnectTags) {
                html = html.replace(/<\/head>/, `${preconnectTags}\n</head>`);
            }

            return html;
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

    plugins: [
        htmlEnvInjectionPlugin(),
        svgr(),
        react(),
        nxViteTsPaths(),
        nxCopyAssetsPlugin(['*.md']),
        copySharedPublicPlugin(),
    ],

    build: {
        sourcemap: process.env.VITE_ENV !== 'PROD',
        minify: 'terser',
        outDir: '../../dist/apps/web',
        emptyOutDir: true,
        reportCompressedSize: true,
        license: { fileName: 'licenses.json' },
        commonjsOptions: {
            include: [/node_modules/],
            extensions: ['.js', '.cjs'],
            strictRequires: true,
            transformMixedEsModules: true,
        },
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-ui': [
                        '@radix-ui/react-dialog',
                        '@radix-ui/react-popover',
                        '@radix-ui/react-accordion',
                        '@radix-ui/react-tabs',
                        '@radix-ui/react-toast',
                        '@radix-ui/react-select',
                        '@radix-ui/react-dropdown-menu',
                        '@radix-ui/react-alert-dialog',
                        '@radix-ui/react-tooltip',
                    ],
                    'vendor-utils': ['zustand', 'i18next', 'react-i18next', 'react-hook-form'],
                },
            },
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
