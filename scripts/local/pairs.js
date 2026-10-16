/**
 * Each backend has its own pair of ports, so its own origins: a session the web keeps in
 * `localStorage` belongs to one origin, and a dev session must never be the one a prod page finds.
 */
const PAIRS = Object.freeze({
    dev: Object.freeze({ web: 5003, shell: 5007 }),
    prod: Object.freeze({ web: 5013, shell: 5017 }),
});

const shellUrl = env => `http://localhost:${PAIRS[env].shell}/__shell/`;

/** How long a newly started pair may take before the switch gives up on it. */
const READY_TIMEOUT_MS = 120_000;

/**
 * Answers a shell page's request to run the other backend. The pair already running is a URL away;
 * otherwise the backend's own preflight decides, and only a clean one starts the pair — the page shows
 * what is missing instead, and nothing switches. Dependencies are handed in so the decision is testable
 * without servers.
 */
function createEnvSwitcher({ running, findProblems, startPair, waitReady, onProd = () => undefined }) {
    const starting = new Map();
    return async env => {
        if (env !== 'dev' && env !== 'prod')
            return { ok: false, problems: [{ message: `unknown environment: ${env}` }] };
        if (running.has(env)) return { ok: true, url: shellUrl(env) };
        if (starting.has(env)) return starting.get(env);
        const attempt = (async () => {
            const problems = await findProblems(env);
            if (problems.length) return { ok: false, problems };
            if (env === 'prod') onProd();
            startPair(env);
            running.add(env);
            const ready = await waitReady(env, READY_TIMEOUT_MS);
            if (!ready)
                return {
                    ok: false,
                    problems: [{ message: `the ${env} servers did not answer within ${READY_TIMEOUT_MS / 1000}s` }],
                };
            return { ok: true, url: shellUrl(env) };
        })();
        starting.set(env, attempt);
        try {
            return await attempt;
        } finally {
            starting.delete(env);
        }
    };
}

module.exports = { PAIRS, shellUrl, createEnvSwitcher, READY_TIMEOUT_MS };
