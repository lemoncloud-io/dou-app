import { useCallback, useEffect, useState } from 'react';

import type { SessionOwnerName } from '@chatic/bridge-messages';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useDebugOperation } from '../../hooks';
import { appBridge } from '../../../../bridge';
import { readLaunchSessionOwner } from '../../../../runtime/launchSessionOwner';
import { useSessionOwnerScreenStrings } from '../../i18n/screens/SessionOwnerScreen';

interface Owners {
    current: SessionOwnerName;
    next: SessionOwnerName;
}

const OWNERS: readonly SessionOwnerName[] = ['web', 'native'];

export const RESTART_WAIT_MS = 5000;

export const SessionOwnerScreen = () => {
    const { result, run } = useDebugOperation();
    const strings = useSessionOwnerScreenStrings();
    const [owners, setOwners] = useState<Owners | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [restarting, setRestarting] = useState(false);
    const pageOwner = readLaunchSessionOwner();

    const load = useCallback(async () => {
        try {
            const res = await appBridge.fetchSessionOwner();
            setOwners(res.data);
            setUnavailable(false);
        } catch {
            setOwners(null);
            setUnavailable(true);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!restarting) return undefined;
        const timer = setTimeout(() => {
            setRestarting(false);
            void load();
        }, RESTART_WAIT_MS);
        return () => clearTimeout(timer);
    }, [restarting, load]);

    const choose = (owner: SessionOwnerName) =>
        void run(strings.operations.setOwner, async () => {
            const res = await appBridge.setSessionOwner(owner);
            if (res.data.restarting) setRestarting(true);
            else await load();
            return res;
        });

    return (
        <div className="flex flex-col gap-4 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">{strings.title}</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">{strings.subtitle}</p>
            </div>

            {unavailable && <p className="text-[13px] text-destructive">{strings.unavailable}</p>}

            {owners && (
                <>
                    <Section title={strings.statusSection}>
                        <Row label={strings.currentLabel} value={strings.owners[owners.current]} />
                        <Row label={strings.nextLabel} value={strings.owners[owners.next]} />
                        {pageOwner && <Row label={strings.pageLabel} value={strings.pageOwners[pageOwner]} />}
                    </Section>

                    <div className="flex flex-wrap gap-2">
                        {OWNERS.map(owner => (
                            <button
                                key={owner}
                                type="button"
                                aria-pressed={owners.next === owner}
                                disabled={restarting || (owners.next === owner && owners.current === owner)}
                                onClick={() => choose(owner)}
                                className="rounded-md border border-border px-2 py-1 text-xs aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:opacity-50"
                            >
                                {strings.owners[owner]}
                            </button>
                        ))}
                        <button
                            type="button"
                            disabled={restarting}
                            onClick={() => void load()}
                            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                        >
                            {strings.refresh}
                        </button>
                    </div>

                    <p className="text-[12px] text-muted-foreground">{strings.carryOver}</p>
                </>
            )}

            {restarting && <p className="text-[13px] font-semibold">{strings.restarting}</p>}
            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
        </div>
    );
};
