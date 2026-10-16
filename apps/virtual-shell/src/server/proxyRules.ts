/** Where the shell page and everything it serves itself live; every other path is the web's. */
export const SHELL_BASE = '/__shell/';

/** The classic script the proxy puts first in every page the web serves (`public/inject.js`). */
export const INJECT_SCRIPT_PATH = `${SHELL_BASE}inject.js`;

/**
 * The proxy's context: every request path except the shell's own. A Vite proxy key that starts with
 * `^` is read as a regular expression, which is the only way to say "everything but".
 */
export const WEB_PATHS = '^/(?!__shell(?:/|$|\\?))';

const INJECT_TAG = `<script src="${INJECT_SCRIPT_PATH}"></script>`;

/**
 * Puts the injection script first in a page, ahead of everything the page runs itself.
 *
 * First means first: the web's `index.html` opens `<head>` with inline scripts that already read what
 * the app injects (`window.CHATIC_APP_THEME`), and its entry module decides once, while it is being
 * evaluated, whether it runs inside the app. The script therefore goes right after `<head>`, and to
 * the very start of a document that has none. A page that already carries it — a response that went
 * through the proxy twice — is left alone.
 */
export const injectShellScript = (html: string): string => {
    if (html.includes(INJECT_TAG)) return html;
    const head = html.match(/<head(\s[^>]*)?>/i);
    if (!head || head.index === undefined) return `${INJECT_TAG}${html}`;
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${INJECT_TAG}${html.slice(at)}`;
};

/** Whether a response is a page the proxy rewrites: any HTML, whatever its path (the web is a SPA). */
export const isHtmlResponse = (contentType: string | string[] | undefined): boolean =>
    /\btext\/html\b/i.test(Array.isArray(contentType) ? contentType.join(',') : (contentType ?? ''));

/**
 * What the phone shows when the web dev server does not answer: it stopped, crashed, or is still
 * starting. No injection — there is no app to boot — and no script, only a line to act on.
 */
export const webUnreachablePage = (origin: string): string =>
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>` +
    `<body style="font-family:-apple-system,sans-serif;padding:24px;color:#374151">` +
    `<h3>The web is not answering</h3>` +
    `<p>The web dev server at <code>${origin.replace(/[<>&"]/g, '')}</code> did not respond. It may still be starting, or ` +
    `<code>yarn local</code> may have stopped — check its terminal, then use Restart.</p></body></html>`;
