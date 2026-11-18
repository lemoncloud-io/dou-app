import { host, resolveDiagnosticsMethod, type ShellOrBrowser } from '@chatic/host';

let beforePublish: ShellOrBrowser | undefined;
let resolving = false;

/**
 * Where this page's diagnostics go — the `diagnostics` port's `kind`: `shell` when the app keeps the
 * logs and reports, `browser` when the page sends its own.
 *
 * Logging is wired before the entry point publishes the host's ports (`main.tsx`: an entry
 * dispatched before the log listeners and the context are attached would land nowhere), so the log
 * pipeline's own readers can run while `host.ports` would still throw. Until the publish, the answer
 * comes from the resolver the entry point publishes from, over the same frozen host profile — the
 * same answer, read once.
 *
 * The resolver logs when a declaration names something other than `'shell'` or `'browser'`, and a log
 * entry reads its context through here: while that one entry is being stamped, the answer is the
 * `browser` the resolver is about to return, rather than a second resolution.
 */
export const diagnosticsKind = (): ShellOrBrowser => {
    if (host.isPublished) return host.ports.diagnostics.kind;
    if (resolving) return 'browser';
    if (beforePublish === undefined) {
        resolving = true;
        try {
            beforePublish = resolveDiagnosticsMethod();
        } finally {
            resolving = false;
        }
    }
    return beforePublish;
};
