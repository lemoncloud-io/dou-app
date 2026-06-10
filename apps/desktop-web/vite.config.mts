/// <reference types='vitest' />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import svgr from 'vite-plugin-svgr';

import desktopPkg from './package.json' with { type: 'json' };

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

    plugins: [htmlEnvInjectionPlugin(), svgr(), react(), nxViteTsPaths()],

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
