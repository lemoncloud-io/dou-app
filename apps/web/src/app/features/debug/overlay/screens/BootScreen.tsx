import { useCallback, useEffect, useState } from 'react';

import { CopyButton } from '../../components/CopyButton';
import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useBootScreenStrings } from '../../i18n/screens/BootScreen';
import { getBootSnapshot, type BootSnapshot } from '../../metrics/bootMarks';
import { getVitals, type VitalSample } from '../../../../utils/webVitalsStore';

const ms = (value: number | undefined | null) => (value != null ? `${value} ms` : null);

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

/**
 * Current-session boot timeline: navigation timing + app milestones + paint
 * vitals + whether the core bundles came from cache or the network. Everything
 * is relative to navigation start, so rows read as one timeline. Polled while
 * open — late resource entries and LCP updates keep flowing in.
 */
export const BootScreen = () => {
    const t = useBootScreenStrings();
    const [snapshot, setSnapshot] = useState<BootSnapshot | null>(null);
    const [vitals, setVitals] = useState<Record<string, VitalSample>>({});

    // Named for the JSON, not the state: `snapshot` is already the BootSnapshot above. Hooks may
    // not sit after the early return below, so this is declared here and reads the state it needs.
    const bootJson = useCallback(() => JSON.stringify({ boot: snapshot, vitals }, null, 2), [snapshot, vitals]);

    useEffect(() => {
        const poll = () => {
            setSnapshot(getBootSnapshot());
            setVitals(getVitals());
        };
        poll();
        const id = setInterval(poll, 1000);
        return () => clearInterval(id);
    }, []);

    if (!snapshot) return null;
    const { navigation, marks, assets } = snapshot;
    const cachedCount = assets.filter(a => a.fromCache).length;
    const downloadedBytes = assets.reduce((sum, a) => sum + a.transferSize, 0);

    return (
        <div className="space-y-3 p-4">
            <div className="flex justify-end">
                <CopyButton value={bootJson} label={t.copyBoot} />
            </div>

            <Section title={t.navigation.title}>
                <Row label="TTFB" value={ms(navigation?.ttfbMs)} />
                <Row label={t.navigation.responseEnd} value={ms(navigation?.responseEndMs)} />
                <Row label="DOMContentLoaded" value={ms(navigation?.domContentLoadedMs)} />
                <Row label={t.navigation.load} value={ms(navigation?.loadEndMs)} />
            </Section>

            <Section title={t.milestones.title}>
                <Row label={t.milestones.mainStart} value={ms(marks['main-start'])} />
                <Row label={t.milestones.appRender} value={ms(marks['app-render'])} />
                <Row label={t.milestones.sessionInit} value={ms(marks['session-initialized'])} />
            </Section>

            <Section title={t.paint.title}>
                <Row
                    label="FCP"
                    value={vitals.FCP ? `${Math.round(vitals.FCP.value)} ms (${vitals.FCP.rating})` : null}
                />
                <Row
                    label="LCP"
                    value={vitals.LCP ? `${Math.round(vitals.LCP.value)} ms (${vitals.LCP.rating})` : null}
                />
                <Row label={t.paint.ttfbVitals} value={vitals.TTFB ? `${Math.round(vitals.TTFB.value)} ms` : null} />
            </Section>

            <Section title={t.assets.title(cachedCount, assets.length, kb(downloadedBytes))}>
                {assets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t.assets.empty}</p>
                ) : (
                    assets.map(a => (
                        <Row
                            key={a.name}
                            label={a.name}
                            value={
                                a.fromCache
                                    ? t.assets.cached(a.durationMs)
                                    : t.assets.downloaded(kb(a.transferSize), a.durationMs)
                            }
                        />
                    ))
                )}
            </Section>
        </div>
    );
};
