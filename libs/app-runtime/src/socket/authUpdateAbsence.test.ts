import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * `auth.update` absence gate — the socket handshake is owned solely by the SDK's `ClientSocketAuth`.
 *
 * Same shape as `refreshAbsence.test.ts`, and an absence check for the same reason: what has to hold
 * is not "only the legitimate call sites call it" but **there are zero call sites at all**. A path-
 * pattern lint dies silently once the symbol moves (it actually happened once), but an absence check
 * has no such failure mode.
 *
 * Why there must be no second sender. The controller's state machine (refresh scheduling, failure
 * count, terminal `expired`) runs against the session it itself opened. If the app sends its own
 * `auth.update` separately, an authentication the controller doesn't know about is established, and
 * from then on the controller plans renewals for a session it never opened.
 *
 * What app-runtime does is not firing the packet but **operating the gate** — `bootstrapSocketConnection`
 * only defers the controller's auto-fire timing with `gate.stop()`/`gate.start()`; it never builds the
 * packet itself. So this check only needs to catch code that constructs the string `'auth.update'`
 * (the packet name).
 */
const SRC = join(__dirname, '..');

const SELF = __filename.split('/').pop() as string;

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
    });

/**
 * Comments are stripped first. This package has plenty of comments that **explain** `auth.update`
 * (why the gate is needed, when the SDK sends it), and those comments wrap the name in backticks — a
 * plain string-literal check alone can't tell an explanation from an actual send. Stripping them
 * doesn't weaken the check either: the only way code can construct the packet name is a literal, and
 * a literal survives outside comments.
 */
const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('auth.update 부재 게이트', () => {
    it('app-runtime 어디에도 auth.update 패킷을 짓는 코드가 없다', () => {
        const offenders = walk(SRC)
            .filter(file => !file.endsWith(SELF))
            .filter(file => {
                const code = stripComments(readFileSync(file, 'utf8'));
                // Only actual send sites — the `request('auth.update', …)` shape. `auth.update:ok` is
                // excluded because it's an acknowledgement message name (a subscription isn't a send).
                return /["'`]auth\.update(?!:)["'`]/.test(code);
            })
            .map(file => file.slice(SRC.length + 1));

        expect(offenders).toEqual([]);
    });
});
