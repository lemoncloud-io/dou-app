import type { ConfigEntry, Lane, Writer } from '../types';

const WRITER_OF: Readonly<Record<Lane, Writer>> = {
    serverEnforced: 'server',
    shell: 'shell',
    local: 'local',
    serverDefault: 'server',
};

export class ConfigLanePolicy {
    readonly order: readonly Lane[] = ['serverEnforced', 'shell', 'local', 'serverDefault'];

    canSupply(entry: ConfigEntry, lane: Lane, isUnlocked: boolean): boolean {
        if (!entry.writableBy.includes(WRITER_OF[lane])) return false;
        if (lane !== 'local') return true;
        if (entry.meta || entry.surface !== 'dev') return true;
        return isUnlocked;
    }

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
