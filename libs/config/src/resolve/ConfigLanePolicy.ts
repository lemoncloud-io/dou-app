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
     */
    canSupply(entry: ConfigEntry, lane: Lane, isUnlocked: boolean): boolean {
        if (!entry.writableBy.includes(WRITER_OF[lane])) return false;
        if (lane !== 'local') return true;
        if (entry.meta) return true;
        return isUnlocked;
    }

    /** Who may write this key on this device right now. Feeds `ConfigSnapshot.canWrite`. */
    writersFor(entry: ConfigEntry, isUnlocked: boolean, wired: Readonly<Record<Writer, boolean>>): readonly Writer[] {
        const writers: Writer[] = [];
        for (const writer of ['shell', 'local', 'server'] as const) {
            if (!entry.writableBy.includes(writer)) continue;
            if (!wired[writer]) continue;
            if (writer === 'local' && !entry.meta && !isUnlocked) continue;
            writers.push(writer);
        }
        return writers;
    }

    writerOf(lane: Lane): Writer {
        return WRITER_OF[lane];
    }
}
