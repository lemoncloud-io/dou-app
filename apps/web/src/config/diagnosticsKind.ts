import { host, resolveDiagnosticsMethod, type ShellOrBrowser } from '@chatic/runtime-hybrid-web';

let beforePublish: ShellOrBrowser | undefined;
let resolving = false;

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
