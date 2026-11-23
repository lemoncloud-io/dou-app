/**
 * Path rules for the auto-merge classifier: which files are never auto-merged, and which proof
 * class a file can belong to. Plain regular expressions over repo-relative POSIX paths, so the
 * workflow needs no glob package.
 */

/** Paths a reviewer always has to see, each with the label the bot comment shows. */
const EXCLUDED = [
    { label: 'ADR', re: /^docs\/adr\// },
    { label: 'agent instructions', re: /(^|\/)(AGENTS|CLAUDE)\.md$/ },
    { label: 'agent skills', re: /^docs\/config\/skills\// },
    { label: 'agent settings', re: /(^|\/)\.claude\// },
    { label: 'GitHub workflows and settings', re: /^\.github\// },
    { label: 'lint rules', re: /^tools\/eslint-rules\// },
    {
        label: 'lint or format config',
        re: /(^|\/)(eslint\.config\.[^/]+|\.eslintrc[^/]*|\.eslintignore|\.prettierrc[^/]*|prettier\.config\.[^/]+|\.prettierignore|commitlint\.config\.[^/]+|\.commitlintrc[^/]*|\.lintstagedrc[^/]*|lint-staged\.config\.[^/]+|\.editorconfig)$/,
    },
    { label: 'git hooks', re: /^\.husky\// },
    {
        label: 'dependencies',
        re: /(^|\/)(package\.json|yarn\.lock|package-lock\.json|pnpm-lock\.yaml|Podfile|Podfile\.lock|Gemfile|Gemfile\.lock|\.yarnrc[^/]*|\.npmrc|\.nvmrc)$/,
    },
    { label: 'native code', re: /^apps\/mobile\/(ios|android)\// },
    {
        label: 'release and deploy',
        re: /^(scripts\/(deploy-|version-|build-android|install-android|finish-deploy-env)|docs\/infra\/)/,
    },
    { label: 'release and deploy', re: /(^|\/)(CHANGELOG\.md|fastlane\/)/ },
    { label: 'the auto-merge classifier itself', re: /^scripts\/auto-merge\// },
    { label: 'repository scripts CI runs', re: /^scripts\/(?!__tests__\/)/ },
    { label: 'environment file', re: /(^|\/)\.env($|\.)/ },
    {
        label: 'build config',
        re: /(^|\/)(project\.json|tsconfig[^/]*\.json|nx\.json|\.babelrc[^/]*|(vite|vitest|jest|playwright|webpack|rollup|babel|metro|tailwind|postcss)\.config\.[^/]+)$/,
    },
    {
        label: 'screenshot or snapshot baseline',
        re: /(-snapshots\/|(^|\/)__(screenshots|image_snapshots)__\/|\.snap$)/,
    },
];

const TEST_FILE = [/(^|\/)__tests__\//, /(^|\/)__mocks__\//, /\.(test|spec)\.[cm]?[jt]sx?$/, /^apps\/[^/]+-e2e\//];

const SOURCE_FILE = /\.([cm]?[jt]s|[jt]sx)$/;

const MODULE_DOC = /^(apps|libs)\/.+\.md$/;

const DEFAULT_BASELINE = [
    /(^|\/)[^/]*ratchet[^/]*baseline[^/]*\.json$/,
    /(^|\/)\.ratchet\/.+\.json$/,
    /^tools\/ratchets?\/.+\.json$/,
];

function baselinePatterns(env = process.env) {
    const raw = env.AUTO_MERGE_BASELINE_PATTERNS;
    if (!raw) return DEFAULT_BASELINE;
    return raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => new RegExp(s));
}

function excludedBy(path) {
    const hit = EXCLUDED.find(rule => rule.re.test(path));
    return hit ? hit.label : null;
}

const isTestFile = path => TEST_FILE.some(re => re.test(path));
const isSourceFile = path => SOURCE_FILE.test(path);
const isModuleDoc = path => MODULE_DOC.test(path) && !excludedBy(path);
const isBaseline = (path, patterns = baselinePatterns()) => patterns.some(re => re.test(path));

/** `apps/<name>` or `libs/<name>` — the Nx project a path belongs to; null for root files. */
function projectOf(path) {
    const m = /^(apps|libs)\/([^/]+)\//.exec(path);
    return m ? `${m[1]}/${m[2]}` : null;
}

module.exports = {
    EXCLUDED,
    excludedBy,
    isTestFile,
    isSourceFile,
    isModuleDoc,
    isBaseline,
    baselinePatterns,
    projectOf,
};
