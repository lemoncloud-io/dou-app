import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { lineOf, listFiles, withoutComments } from './files';
import {
    CALL_PATTERNS,
    DATA_METHOD_NAME,
    DATA_METHODS,
    DISPLAYS,
    MANIFEST_FIELDS,
    MANIFEST_PERMISSIONS,
    NAME_LIMIT,
    ORIENTATIONS,
    type ManifestPermission,
} from './permissions';

/**
 * The checker: reads a page's manifest, its source and its built bundle, and reports what breaks a
 * rule the app or the package guide sets. It only reads — nothing of the page runs here.
 */

export type RuleId =
    | 'manifest/missing'
    | 'manifest/invalid'
    | 'manifest/version'
    | 'manifest/name'
    | 'manifest/unknown-field'
    | 'manifest/unknown-permission'
    | 'manifest/display'
    | 'manifest/orientation'
    | 'manifest/unused-permission'
    | 'manifest/missing-permission'
    | 'code/unknown-data-method'
    | 'code/local-storage'
    | 'code/os-theme'
    | 'code/history-routing'
    | 'code/popup'
    | 'code/version-compare'
    | 'code/error-message'
    | 'bundle/missing'
    | 'bundle/layout'
    | 'bundle/build-output-only'
    | 'bundle/mock';

/** Every rule, with what it is for: the README's table, and the list a broken page is tried against. */
export const RULES: Readonly<Record<RuleId, string>> = {
    'manifest/missing': 'The page has a `.well-known/chatic-app.json`.',
    'manifest/invalid': 'The manifest is a JSON object.',
    'manifest/version': '`manifestVersion` is `1`; the app ignores any other manifest whole.',
    'manifest/name': '`name` is 1 to 100 characters.',
    'manifest/unknown-field': 'Every field is one the app reads; it ignores the rest silently.',
    'manifest/unknown-permission': 'Every permission is one the app knows.',
    'manifest/display': '`display` is `clean`, `titled` or `immersive`.',
    'manifest/orientation': '`orientation` is `any`, `portrait` or `landscape`.',
    'manifest/unused-permission': 'Every permission asked for is used: ask only for what the page needs.',
    'manifest/missing-permission': 'Every call that needs a permission has it in the manifest.',
    'code/unknown-data-method': 'A cloud data method is one the library types; the app refuses the rest.',
    'code/local-storage': "The page's data goes in `apps.storage`, not `localStorage`.",
    'code/os-theme': "The theme comes from `apps.context.theme`, not the phone's `prefers-color-scheme`.",
    'code/history-routing': 'Screens are an in-memory stack, not browser history or the hash.',
    'code/popup': 'No popups and no `window.opener`: a popup replaces the page in the app.',
    'code/version-compare': 'Ask `apps.supports(…)`; never compare version numbers.',
    'code/error-message': "Branch on an error's `code`, never its `message`.",
    'bundle/missing': 'The page is built: the bundle folder exists.',
    'bundle/layout': 'The bundle has `index.html` and `.well-known/chatic-app.json` at its top, built.',
    'bundle/build-output-only': 'The bundle holds build output only: no sources, maps, packages or dotfiles.',
    'bundle/mock': 'The mock of the app is not in the production bundle.',
};

export interface Finding {
    rule: RuleId;
    message: string;
    /** Relative to the project, with `/` between parts. */
    file?: string;
    line?: number;
    /** What it is about — the permission, field or method — for a reader's message. */
    subject?: string;
}

/** A place the page's code talks to the network, listed for the author to review; never a failure. */
export interface NetworkTarget {
    /** The origin when the address is written out, else the expression the page passes. */
    target: string;
    /** `fetch`, `WebSocket`, … or `address` for a host named in the bundle. */
    via: string;
    file: string;
    line: number;
}

export interface BundleSize {
    files: number;
    bytes: number;
    /** By extension: `.js`, `.css`, … */
    byType: Record<string, number>;
}

export interface CheckResult {
    ok: boolean;
    findings: Finding[];
    networkTargets: NetworkTarget[];
    bundle: BundleSize | null;
    /** The permissions the manifest asks for, as read. */
    permissions: string[];
}

export interface CheckOptions {
    /** The project's folder. */
    root: string;
    /** The page's sources, relative to `root`; `src` by default, or `root` itself without one. */
    src?: string;
    /** The built bundle, relative to `root` (or absolute); `dist` by default. */
    dist?: string;
}

const SOURCE_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.vue',
    '.svelte',
    '.html',
    '.css',
    '.scss',
]);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);
const isTestFile = (file: string) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
const MANIFEST = '.well-known/chatic-app.json';

/** What the mock writes into a bundle it is part of: its log prefix and its version. */
const MOCK_MARKS = ['[chatic-apps mock]', 'installChaticAppsMock', '0.0.0-mock'];

const CODE_RULES: ReadonlyArray<{ rule: RuleId; pattern: RegExp; message: string }> = [
    {
        rule: 'code/local-storage',
        pattern: /\blocalStorage\b/g,
        message: '`localStorage` goes when the system clears website data; use `apps.storage`.',
    },
    {
        rule: 'code/os-theme',
        pattern: /prefers-color-scheme/g,
        message: "The phone's theme is not the app's; follow `apps.context.theme` and `onContextChange`.",
    },
    {
        rule: 'code/history-routing',
        pattern:
            /\bhistory\.(?:pushState|replaceState)\s*\(|\blocation\.hash\s*=(?!=)|['"](?:hashchange|popstate)['"]|\bcreate(?:Browser|Hash)Router\b|<(?:BrowserRouter|HashRouter)\b/g,
        message: 'With a browser history, Android back at the root walks it instead of closing the page.',
    },
    {
        rule: 'code/popup',
        pattern: /\bwindow\.open(?:er)?\b/g,
        message: 'A popup replaces the page in the app; use `apps.openUrl` for a link and a redirect to log in.',
    },
    {
        rule: 'code/version-compare',
        pattern:
            /\b(?:appVersion|protocolVersion|BRIDGE_VERSION)\b[^;\n<>=]{0,20}?(?:[<>]=?(?![/a-zA-Z>=])\s*[\w'"`(]|\.localeCompare\b)|[\w'"`)]\s*[<>]=?\s*[\w.?]*\b(?:appVersion|protocolVersion|BRIDGE_VERSION)\b|\b(?:semver|compareVersions?)\b[^\n]*\b(?:appVersion|protocolVersion)\b/g,
        message: 'A version number says nothing about what this page may do; ask `apps.supports(…)`.',
    },
    {
        rule: 'code/error-message',
        pattern:
            /\.message\s*(?:===|!==|==|!=)|(?:===|!==|==|!=)\s*[\w.?]*\.message\b|\.message\s*\??\.\s*(?:includes|startsWith|endsWith|match|indexOf|search)\s*\(|\.test\s*\(\s*[\w.?]*\.message\b|switch\s*\(\s*[\w.?]*\.message\s*\)/g,
        message: "An error's message is for people and changes; branch on `error.code`.",
    },
];

const NETWORK_CALLS: ReadonlyArray<{ via: string; pattern: RegExp }> = [
    { via: 'fetch', pattern: /\bfetch\s*\(\s*([^,)\n]*)/g },
    { via: 'WebSocket', pattern: /\bnew\s+WebSocket\s*\(\s*([^,)\n]*)/g },
    { via: 'EventSource', pattern: /\bnew\s+EventSource\s*\(\s*([^,)\n]*)/g },
    { via: 'XMLHttpRequest', pattern: /\.open\s*\(\s*['"`][A-Za-z]+['"`]\s*,\s*([^,)\n]*)/g },
    { via: 'sendBeacon', pattern: /\bsendBeacon\s*\(\s*([^,)\n]*)/g },
    { via: 'axios', pattern: /\baxios(?:\.(?:get|post|put|patch|delete|request))?\s*\(\s*([^,)\n]*)/g },
    { via: 'import', pattern: /\bimport\s*\(\s*(['"`]https?:[^'"`]*['"`])/g },
];

/** An absolute address written out in the bundle: its host is where the built page may talk to. */
const ADDRESS = /\b(?:https?|wss?):\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;
/** Hosts a bundle names without talking to them: XML namespaces, the spec links bundlers keep. */
const IGNORED_HOSTS = /^(?:www\.w3\.org|reactjs\.org|react\.dev|github\.com|developer\.mozilla\.org|example\.com)$/;

const originOf = (expression: string): string => {
    const literal = /^['"`]((?:https?|wss?):\/\/[^/'"`$]+)/.exec(expression.trim());
    if (literal) return literal[1];
    const text = expression.trim().replace(/\s+/g, ' ');
    return text.length > 60 ? `${text.slice(0, 57)}…` : text || '(no argument)';
};

const resolveDir = (root: string, dir: string) => (dir.startsWith('/') ? dir : join(root, dir));

const readManifest = (
    path: string,
    file: string,
    findings: Finding[]
): { permissions: string[]; fields: Record<string, unknown> } | null => {
    let value: unknown;
    try {
        value = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        findings.push({ rule: 'manifest/invalid', file, message: 'The manifest is not valid JSON.' });
        return null;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        findings.push({ rule: 'manifest/invalid', file, message: 'The manifest must be a JSON object.' });
        return null;
    }
    const manifest = value as Record<string, unknown>;
    if (manifest.manifestVersion !== 1) {
        findings.push({
            rule: 'manifest/version',
            file,
            message: `manifestVersion is ${JSON.stringify(manifest.manifestVersion)}; it must be 1.`,
        });
    }
    const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
    if (!name || name.length > NAME_LIMIT) {
        findings.push({ rule: 'manifest/name', file, message: `name must be 1 to ${NAME_LIMIT} characters.` });
    }
    for (const field of Object.keys(manifest)) {
        if (!(MANIFEST_FIELDS as readonly string[]).includes(field)) {
            findings.push({
                rule: 'manifest/unknown-field',
                file,
                subject: field,
                message: `The app does not read "${field}".`,
            });
        }
    }
    const declared = manifest.permissions === undefined ? [] : manifest.permissions;
    if (!Array.isArray(declared)) {
        findings.push({ rule: 'manifest/invalid', file, message: 'permissions must be an array.' });
    }
    const permissions = (Array.isArray(declared) ? declared : []).map(String);
    for (const permission of permissions) {
        if (!(MANIFEST_PERMISSIONS as readonly string[]).includes(permission)) {
            findings.push({
                rule: 'manifest/unknown-permission',
                file,
                subject: permission,
                message: `"${permission}" is not a permission the app knows.`,
            });
        }
    }
    if (manifest.display !== undefined && !(DISPLAYS as readonly unknown[]).includes(manifest.display)) {
        findings.push({ rule: 'manifest/display', file, message: `display must be one of ${DISPLAYS.join(', ')}.` });
    }
    if (manifest.orientation !== undefined && !(ORIENTATIONS as readonly unknown[]).includes(manifest.orientation)) {
        findings.push({
            rule: 'manifest/orientation',
            file,
            message: `orientation must be one of ${ORIENTATIONS.join(', ')}.`,
        });
    }
    return { permissions, fields: manifest };
};

/** Checks the page in `options.root`. */
export const check = (options: CheckOptions): CheckResult => {
    const { root } = options;
    const findings: Finding[] = [];
    const networkTargets: NetworkTarget[] = [];

    // -- The bundle --------------------------------------------------------------------------------
    const distDir = resolveDir(root, options.dist ?? 'dist');
    const distName = options.dist ?? 'dist';
    let bundle: BundleSize | null = null;
    const built = existsSync(distDir) && statSync(distDir).isDirectory();
    if (!built) {
        findings.push({
            rule: 'bundle/missing',
            message: `No bundle at ${distName}: build the page first, then check again.`,
        });
    } else {
        const files = listFiles(distDir);
        bundle = { files: files.length, bytes: 0, byType: {} };
        for (const file of files) {
            const bytes = statSync(join(distDir, file)).size;
            const type = extname(file) || '(none)';
            bundle.bytes += bytes;
            bundle.byType[type] = (bundle.byType[type] ?? 0) + bytes;
        }
        if (!files.includes('index.html')) {
            findings.push({
                rule: 'bundle/layout',
                message: `${distName}/index.html is missing: it is what / serves.`,
            });
        } else if (/\bsrc=["']\/?src\//.test(readFileSync(join(distDir, 'index.html'), 'utf8'))) {
            findings.push({
                rule: 'bundle/layout',
                file: `${distName}/index.html`,
                message: 'index.html still loads the sources (/src/…): it is the project page, not the built one.',
            });
        }
        if (!files.includes(MANIFEST)) {
            findings.push({
                rule: 'bundle/layout',
                message: `${distName}/${MANIFEST} is missing: with Vite, put it in public/${MANIFEST}.`,
            });
        }
        for (const file of files) {
            const parts = file.split('/');
            const dotted = parts.find(part => part.startsWith('.') && part !== '.well-known');
            const source =
                parts.some(part => ['node_modules', 'src'].includes(part)) ||
                /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|tsconfig[^/]*\.json)$/.test(file) ||
                /\.(tsx?|map|vue|svelte)$/.test(file);
            if (dotted || source) {
                findings.push({
                    rule: 'bundle/build-output-only',
                    file: `${distName}/${file}`,
                    message: dotted
                        ? 'A dotfile is not build output; it may hold what should never ship.'
                        : 'Sources, source maps and package files are not build output.',
                });
            }
            if (/\.(m?js|html)$/.test(file)) {
                const text = readFileSync(join(distDir, file), 'utf8');
                if (MOCK_MARKS.some(mark => text.includes(mark))) {
                    findings.push({
                        rule: 'bundle/mock',
                        file: `${distName}/${file}`,
                        message: 'The mock of the app is in the bundle: install it under `import.meta.env.DEV` only.',
                    });
                }
                if (/\.m?js$/.test(file)) {
                    const hosts = new Set<string>();
                    for (const match of text.matchAll(ADDRESS)) {
                        const host = match[1].toLowerCase();
                        if (IGNORED_HOSTS.test(host) || hosts.has(host)) continue;
                        hosts.add(host);
                        networkTargets.push({
                            target: host,
                            via: 'address',
                            file: `${distName}/${file}`,
                            line: lineOf(text, match.index ?? 0),
                        });
                    }
                }
            }
        }
    }

    // -- The manifest: the bundle's copy, which is what ships, else the project's ---------------------
    const candidates = [
        ...(built ? [{ path: join(distDir, MANIFEST), file: `${distName}/${MANIFEST}` }] : []),
        { path: join(root, 'public', MANIFEST), file: `public/${MANIFEST}` },
        { path: join(root, MANIFEST), file: MANIFEST },
    ];
    const found = candidates.find(candidate => existsSync(candidate.path));
    const manifest = found ? readManifest(found.path, found.file, findings) : null;
    if (!found) {
        findings.push({
            rule: 'manifest/missing',
            message: `No ${MANIFEST}: the page gets no permission without one.`,
        });
    }
    const permissions = manifest?.permissions ?? [];

    // -- The source ------------------------------------------------------------------------------------
    const srcName = options.src ?? (existsSync(join(root, 'src')) ? 'src' : '.');
    const srcDir = resolveDir(root, srcName);
    const sources = [
        ...listFiles(srcDir, name => SKIPPED_DIRS.has(name)).map(file =>
            srcName === '.' ? file : `${srcName.replace(/\/$/, '')}/${file}`
        ),
        ...(srcName !== '.' && existsSync(join(root, 'index.html')) ? ['index.html'] : []),
    ].filter(file => SOURCE_EXTENSIONS.has(extname(file)) && !isTestFile(file));

    const used = new Map<ManifestPermission, { file: string; line: number; call: string }>();
    const use = (permission: ManifestPermission, file: string, line: number, call: string) => {
        if (!used.has(permission)) used.set(permission, { file, line, call });
    };
    for (const file of sources) {
        const text = withoutComments(readFileSync(join(root, file), 'utf8'));
        for (const { rule, pattern, message } of CODE_RULES) {
            for (const match of text.matchAll(pattern)) {
                findings.push({ rule, file, line: lineOf(text, match.index ?? 0), message });
            }
        }
        const namesSdk = /chatic-apps-sdk/.test(text);
        for (const { pattern, permissions: needs, call } of namesSdk ? CALL_PATTERNS : []) {
            const match = new RegExp(pattern.source, 'g').exec(text);
            if (match) needs.forEach(permission => use(permission, file, lineOf(text, match.index), call));
        }
        for (const match of text.matchAll(DATA_METHOD_NAME)) {
            const method = match[1];
            const line = lineOf(text, match.index ?? 0);
            const permission = (DATA_METHODS as Record<string, ManifestPermission>)[method];
            if (permission) use(permission, file, line, method);
            else {
                findings.push({
                    rule: 'code/unknown-data-method',
                    file,
                    line,
                    subject: method,
                    message: `${method} is not a method the app opens to a page.`,
                });
            }
        }
        for (const { via, pattern } of NETWORK_CALLS) {
            for (const match of text.matchAll(pattern)) {
                networkTargets.push({
                    target: originOf(match[1] ?? ''),
                    via,
                    file,
                    line: lineOf(text, match.index ?? 0),
                });
            }
        }
    }

    if (manifest) {
        for (const permission of permissions) {
            if ((MANIFEST_PERMISSIONS as readonly string[]).includes(permission) && !used.has(permission as never)) {
                findings.push({
                    rule: 'manifest/unused-permission',
                    file: found?.file,
                    subject: permission,
                    message: `"${permission}" is asked for, and nothing in ${srcName} uses it.`,
                });
            }
        }
    }
    for (const [permission, at] of used) {
        if (!permissions.includes(permission)) {
            findings.push({
                rule: 'manifest/missing-permission',
                file: at.file,
                line: at.line,
                subject: permission,
                message: `${at.call} needs "${permission}" in the manifest; without it the app refuses it.`,
            });
        }
    }

    return { ok: findings.length === 0, findings, networkTargets, bundle, permissions };
};

/** The result as the command prints it. */
export const formatCheck = (result: CheckResult): string => {
    const lines: string[] = [];
    for (const finding of result.findings) {
        const at = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}  ` : '';
        lines.push(`✗ ${finding.rule}  ${at}${finding.message}`);
    }
    lines.push('', 'Network targets (review what each one receives; the checker does not block them):');
    if (result.networkTargets.length === 0) lines.push('  none found');
    for (const target of result.networkTargets) {
        lines.push(`  ${target.via.padEnd(14)} ${target.target}  (${target.file}:${target.line})`);
    }
    if (result.bundle) {
        const types = Object.entries(result.bundle.byType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, bytes]) => `${type} ${bytes.toLocaleString('en')}`)
            .join(', ');
        lines.push(
            '',
            `Bundle: ${result.bundle.files} files, ${result.bundle.bytes.toLocaleString('en')} bytes (${types})`
        );
    }
    lines.push(
        '',
        result.ok
            ? `✓ check passed (${Object.keys(RULES).length} rules)`
            : `✗ check failed: ${result.findings.length} finding(s)`
    );
    return lines.join('\n');
};
