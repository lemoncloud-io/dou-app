import type { ConfigEntry, Lane, Writer } from '../types';

/** Which writer a lane speaks for. Both server lanes answer to `server`. */
const WRITER_OF: Readonly<Record<Lane, Writer>> = {
    serverEnforced: 'server',
    shell: 'shell',
    local: 'local',
    serverDefault: 'server',
};

/**
 * The precedence table, and who is allowed to fill each row.
 *
 * The order is the whole contract, so it lives in exactly one place — this array.
 *
 *  1 serverEnforced  the kill switch. Beats everything, including a local override, because a
 *                    device whose override is wrong is exactly the one that has to be recovered.
 *  2 shell           what the app stored. Survives a WebView cache wipe.
 *  3 local           what the web changed, and only while overrides are unlocked.
 *  4 serverDefault   remote tuning. BELOW local on purpose, so an engineer can still experiment on
 *                    their own device while a remote default is in effect.
 *
 * Rows 5 and 6 (the stage rule and `defaultValue`) are registry declarations rather than lanes, so
 * they have no class and are not listed here.
 */
export class ConfigLanePolicy {
    readonly order: readonly Lane[] = ['serverEnforced', 'shell', 'local', 'serverDefault'];

    /**
     * Whether a lane is allowed to supply a value for this key.
     *
     * **A `meta` key ignores the unlock gate.** These keys ARE the lock, so applying the gate to
     * them would make resolving the unlock ask for the unlock. The dedicated flow (tap counter plus
     * entry code) is what guards them instead, and this exemption is the invariant that keeps the
     * resolver from recursing (ADR-0079 결정 4).
     *
     * **A non-`dev` key also ignores the gate.** The lock exists to keep a QA override of a
     * developer-facing default from taking effect in a stranger's PROD build — it was never meant to
     * stop the app persisting a user's own routine action (pinning a channel, muting push, picking a
     * theme). Every `writableBy: ['local']`-only key discovered while wiring real consumers turned
     * out to be exactly that kind of ordinary app-owned state, not a QA lever, which is what
     * `surface` already distinguishes: `dev` is the QA/debug 80%, `user`/`internal`/`labs` are things
     * a person (or the app on their behalf) does in the ordinary course of using the product. Gating
     * those behind the 10-tap debug unlock would have made basic features permanently unusable in
     * PROD, since they have no other writer to fall back to.
     */
    canSupply(entry: ConfigEntry, lane: Lane, isUnlocked: boolean): boolean {
        if (!entry.writableBy.includes(WRITER_OF[lane])) return false;
        if (lane !== 'local') return true;
        if (entry.meta || entry.surface !== 'dev') return true;
        return isUnlocked;
    }

    /** Who may write this key on this device right now. Feeds `ConfigSnapshot.canWrite`. */
    writersFor(entry: ConfigEntry, isUnlocked: boolean, wired: Readonly<Record<Writer, boolean>>): readonly Writer[] {
        const writers: Writer[] = [];
        for (const writer of ['shell', 'local', 'server'] as const) {
            if (!entry.writableBy.includes(writer)) continue;
            if (!wired[writer]) continue;
            if (writer === 'local' && !entry.meta && entry.surface === 'dev' && !isUnlocked) continue;
            writers.push(writer);
        }
        return writers;
    }

    writerOf(lane: Lane): Writer {
        return WRITER_OF[lane];
    }
}
