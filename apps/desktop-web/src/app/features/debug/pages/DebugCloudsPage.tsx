import { useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainCloud } from '@chatic/data';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { cloudLabel, useCloudSessionCatalog, useClouds, useJoinedCloudsStore } from '../../../shared';

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_LABEL: Record<CopyState, string> = { idle: 'Copy JSON', copied: 'Copied', failed: 'Copy failed' };

/** Long enough to read the outcome, short enough that a second copy gets its own. */
const COPY_FEEDBACK_MS = 1500;

const Heading = ({ children }: { children: string }) => (
    <h2 className="mb-2 text-tiny font-bold uppercase tracking-widest text-primary-ink">{children}</h2>
);

const JsonCard = ({ title, value }: { title: string; value: unknown }) => (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="break-all font-mono text-caption font-semibold text-foreground">{title}</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-tiny text-muted-foreground">
            {JSON.stringify(value, null, 2)}
        </pre>
    </div>
);

/**
 * Everything the cloud switcher builds a row from, side by side: the relay catalog as the server
 * sent it, the local cloud cache (whose name wins over the catalog's), the invite-joined clouds,
 * and the rail entries those produce. A row that reads wrong in the switcher — an untitled or
 * suspended cloud — is diagnosed by finding which source it came from, so the sources are shown
 * raw rather than summarised.
 */
export const DebugCloudsPage = () => {
    const { clouds: catalog, isFetchingClouds, isCloudsError, refetchClouds } = useCloudSessionCatalog();
    const { clouds: rail } = useClouds();
    const joined = useJoinedCloudsStore(s => s.joinedClouds);
    const { cloud: cloudRepository } = runtime.data.useRuntimeRepositories();
    const [cached, setCached] = useState<DomainCloud[]>([]);
    const [copyState, setCopyState] = useState<CopyState>('idle');

    useEffect(() => cloudRepository.observeList(result => setCached(result?.list ?? [])), [cloudRepository]);

    useEffect(() => {
        if (copyState === 'idle') return;
        const timer = setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
        return () => clearTimeout(timer);
    }, [copyState]);

    // One paste carries every source, so a report from another user's machine needs no follow-up.
    // The clipboard can refuse (no focus, no permission), and this is the tab's one action, so a
    // refusal is shown rather than dropped.
    const copy = async () => {
        const report = { capturedAt: new Date().toISOString(), catalog, cached, joined, rail };
        try {
            await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
            setCopyState('copied');
        } catch {
            setCopyState('failed');
        }
    };

    return (
        <div className="mx-auto w-full max-w-4xl p-6">
            <div className="mb-1 flex items-center gap-2">
                <h1 className="text-lead font-semibold text-foreground">Clouds</h1>
                <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={isFetchingClouds}
                    onClick={() => void refetchClouds()}
                >
                    {isFetchingClouds ? 'Reloading…' : 'Reload catalog'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void copy()}>
                    {COPY_LABEL[copyState]}
                </Button>
            </div>
            <p className="mb-4 text-right text-tiny text-muted-foreground">The copy includes cloud emails.</p>
            {isCloudsError && <p className="mb-3 text-callout text-destructive">The catalog read failed.</p>}

            <Heading>{`Rail (${rail.length})`}</Heading>
            <div className="mb-6 rounded-xl border border-border bg-card px-4 py-3">
                {rail.map((entry, index) => (
                    <p key={`${index}:${entry.id}`} className="break-all py-1 font-mono text-caption text-foreground">
                        {/* The switcher's own test for "untitled", so a generated name reads as it does there. */}
                        {entry.kind} · {entry.id} · {cloudLabel(entry, '(untitled)')} · {entry.status ?? '—'}
                    </p>
                ))}
            </div>

            <Heading>{`Relay catalog (${catalog.length})`}</Heading>
            <div className="mb-6 grid gap-3">
                {catalog.map((cloud, index) => (
                    <JsonCard
                        key={`${index}:${cloud.id ?? ''}`}
                        title={`${cloud.id ?? '—'} · ${String(cloud.status ?? '—')}`}
                        value={cloud}
                    />
                ))}
            </div>

            <Heading>{`Local cache (${cached.length})`}</Heading>
            <div className="mb-6 grid gap-3">
                {cached.map((cloud, index) => (
                    <JsonCard
                        key={`${index}:${cloud.id ?? ''}`}
                        title={`${cloud.id ?? '—'} · ${String(cloud.cloudType ?? '—')}`}
                        value={cloud}
                    />
                ))}
            </div>

            <Heading>{`Joined by invite (${Object.keys(joined).length})`}</Heading>
            <div className="grid gap-3">
                {Object.entries(joined).map(([id, cloud]) => (
                    <JsonCard key={id} title={id} value={cloud} />
                ))}
            </div>
        </div>
    );
};
