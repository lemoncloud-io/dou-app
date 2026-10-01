/// <reference types='vitest' />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite';
import svgr from 'vite-plugin-svgr';

import desktopPkg from './package.json' with { type: 'json' };

/**
 * pdf.js's data files, served at `/pdfjs/<dir>/` in dev and emitted there in a build: the Adobe
 * CMaps and standard fonts a PDF may name without embedding (common in Korean files), the ICC
 * profiles, and the image-decoder wasm. Without them such a PDF draws without its text or images.
 * The script-engine wasm is left out; the viewer never runs a PDF's scripts.
 */
const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'iccs', 'wasm'];
const pdfjsAssetsPlugin = (): Plugin => {
    const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
    // `<dir>/<name>` of every file served. A request is answered only on an exact match, so no path
    // it names can reach outside these folders.
    const files = new Set(
        PDFJS_ASSET_DIRS.flatMap(dir =>
            readdirSync(join(root, dir))
                .filter(name => !name.startsWith('quickjs') && statSync(join(root, dir, name)).isFile())
                .map(name => `${dir}/${name}`)
        )
    );
    return {
        name: 'pdfjs-assets',
        configureServer(server) {
            server.middlewares.use('/pdfjs', (req, res, next) => {
                let file = '';
                try {
                    file = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
                } catch {
                    // A malformed escape names no file of ours.
                }
                if (!files.has(file)) return next();
                res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
                res.end(readFileSync(join(root, file)));
            });
        },
        generateBundle() {
            for (const file of files) {
                this.emitFile({ type: 'asset', fileName: `pdfjs/${file}`, source: readFileSync(join(root, file)) });
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
    cacheDir: '../../node_modules/.vite/apps/desktop-web',

    optimizeDeps: {
        // Pre-bundle React once so lazy route chunks (React.lazy /settings, /profile,
        // /debug) can never pick up a second optimizer instance — that mismatch surfaces
        // as "Invalid hook call … more than one copy of React" inside Radix components.
        include: ['react', 'react-dom', 'react/jsx-runtime'],
        exclude: ['react-native'],
    },

    define: {
        'process.env': {},
        'process.env.I18N_VERSION': JSON.stringify(Date.now().toString()),
        __APP_VERSION__: JSON.stringify(desktopPkg.version),
        ...(process.env.NODE_ENV === 'development'
            ? {
                  global: 'window',
                  'process.env.I18N_VERSION': JSON.stringify('dev'),
              }
            : {}),
    },

    resolve: {
        // Force every `react`/`react-dom` specifier — including the ones inside
        // lazy route chunks and pre-bundled deps (Radix, react-native-web) — to the
        // single root copy. Without this the dev optimizer can hand a lazy chunk a
        // second React instance → "Invalid hook call … more than one copy of React".
        dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
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
        port: 5005,
        host: 'localhost',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd()), searchForWorkspaceRoot(process.cwd()) + '../../../assets'],
        },
    },

    preview: {
        port: 5005,
        host: 'localhost',
    },

    plugins: [htmlEnvInjectionPlugin(), pdfjsAssetsPlugin(), svgr(), react(), nxViteTsPaths()],

    build: {
        sourcemap: process.env.VITE_ENV !== 'PROD',
        minify: 'terser',
        outDir: '../../dist/apps/desktop-web',
        emptyOutDir: true,
        reportCompressedSize: true,
        commonjsOptions: {
            include: [/node_modules/],
            extensions: ['.js', '.cjs'],
            strictRequires: true,
            transformMixedEsModules: true,
        },
        // No manual vendor splitting: forcing React 19's CJS build into a separate
        // chunk under @rollup/plugin-commonjs `strictRequires` breaks its module
        // init (`Cannot set properties of undefined (setting 'Activity')` →
        // white screen in the prod build only). Let Rollup chunk automatically; the
        // lazy route splits (React.lazy) still keep the entry bundle small.
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
            reportsDirectory: '../../coverage/apps/desktop-web',
            provider: 'v8',
        },
    },
});
