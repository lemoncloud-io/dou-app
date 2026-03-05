/// <reference types='vitest' />
import * as fs from 'fs';
import * as path from 'path';

import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import svgr from 'vite-plugin-svgr';

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
            const outDir = path.resolve(import.meta.dirname, '../../dist/apps/admin');
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

            return html.replace(/<body>/, `${envScript}\n<body>`);
        },
    };
};

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/admin',

    optimizeDeps: {
        exclude: ['react-native'],
    },

    define: {
        'process.env': {},
        'process.env.I18N_VERSION': JSON.stringify(Date.now().toString()),
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
        port: 5001,
        host: 'localhost',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd()), searchForWorkspaceRoot(process.cwd()) + '../../../assets'],
        },
    },

    preview: {
        port: 5001,
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
        outDir: '../../dist/apps/admin',
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
            reportsDirectory: '../../coverage/apps/admin',
            provider: 'v8',
        },
    },
});
