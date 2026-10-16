/**
 * Field names that carry a credential somewhere in the bridge traffic or the page's logging — the
 * sign-in results above all (`OnOAuthLogin`), whose ID token would otherwise leave the page through
 * "Copy JSON". Matched as substrings, case-insensitively: `idToken`, `refreshToken`, `serverAuthCode`,
 * `Authorization`, `x-api-key` and their kin.
 */
const CREDENTIAL_KEY =
    /token|secret|passw(or)?d|credential|signature|cookie|authorization|auth[-_]?code|api[-_]?key|session[-_]?key|private[-_]?key/i;

/** Credentials that turn up inside free text: a JWT (`eyJ….….…`) and an `Authorization` scheme value. */
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;
const SCHEME_VALUE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g;

/** How far a value is walked, and how much of it; past either, the rest is summarised. */
const MAX_DEPTH = 8;
const MAX_NODES = 5_000;

/** A credential reduced to what tells two apart without letting either be used: `eyJhbG…(1184)`. */
export const maskCredential = (value: string): string => `${value.slice(0, 6)}…(${value.length})`;

/** Free text with every embedded JWT and `Bearer`/`Basic` value masked. */
export const maskText = (text: string): string =>
    text.replace(JWT, token => maskCredential(token)).replace(SCHEME_VALUE, (_, scheme: string) => `${scheme} …`);

/**
 * An `Error` from any realm (the frame's errors are not this page's `Error`), kept as what a reader
 * needs — its own properties are not enumerable, so a plain copy would leave `{}`.
 */
const isError = (value: object): value is Error =>
    Object.prototype.toString.call(value) === '[object Error]' ||
    (typeof (value as Error).message === 'string' && typeof (value as Error).stack === 'string');

/** A DOM node from any realm: logged as its name, never walked (a node reaches the whole document). */
const isNode = (value: object): value is Node =>
    typeof (value as Node).nodeType === 'number' && typeof (value as Node).nodeName === 'string';

/**
 * A copy of `value` safe to keep and show: every credential field masked at any depth, every embedded
 * token in a string masked, and anything a log line should not hold whole — DOM nodes, windows,
 * functions, cycles, very deep or very large values — summarised. What the page logs is arbitrary
 * (`console.log(element)` hands over a React-owned node), so the walk is bounded.
 */
export const redactCredentials = (value: unknown): unknown => {
    const seen = new WeakSet<object>();
    let nodes = 0;
    const walk = (current: unknown, depth: number): unknown => {
        if (typeof current === 'string') return maskText(current);
        if (typeof current === 'function') return `[function ${current.name || 'anonymous'}]`;
        if (!current || typeof current !== 'object') return current;
        if (seen.has(current)) return '[circular]';
        if (depth > MAX_DEPTH || ++nodes > MAX_NODES) return '[…]';
        seen.add(current);
        if ((current as { window?: unknown }).window === current) return '[Window]';
        if (isNode(current)) return `<${current.nodeName.toLowerCase()}>`;
        if (isError(current)) {
            return { name: current.name, message: maskText(current.message), stack: maskText(current.stack ?? '') };
        }
        if (Array.isArray(current)) return current.map(item => walk(item, depth + 1));
        const copy: Record<string, unknown> = {};
        for (const [key, field] of Object.entries(current)) {
            copy[key] =
                CREDENTIAL_KEY.test(key) && typeof field === 'string' ? maskCredential(field) : walk(field, depth + 1);
        }
        return copy;
    };
    return walk(value, 0);
};
