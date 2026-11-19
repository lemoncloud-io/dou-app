import { host, resolveDiagnosticsMethod, type ShellOrBrowser } from '@chatic/runtime-web';

let beforePublish: ShellOrBrowser | undefined;
let resolving = false;

/**
 * Where this page's diagnostics go — the `diagnostics` port's `kind`: `shell` when the app keeps the
 * logs and reports, `browser` when the page sends its own.
 *
 * Logging is wired before `startRuntime` publishes the host's ports (`main.tsx`: an entry dispatched
 * before the log listeners and the context are attached would land nowhere), so the log pipeline's own
 * readers can run while `runtime.diagnostics` would still throw. Until the publish, the answer comes
 * from the reader the declaration's `diagnostics.host` adapter publishes from, over the same frozen
 * host profile — the same answer, read once. (A `port.diagnostics` toggle takes effect at the publish.)
 *
 * Here rather than beside the log pipeline because whether the ports are published yet, and what the
 * host declared, are the declaration's to know: the call part reads the published port alone.
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
