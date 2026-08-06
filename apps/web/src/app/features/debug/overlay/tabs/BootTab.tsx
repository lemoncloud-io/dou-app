import { useEffect, useState } from 'react';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
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
export const BootTab = () => {
    const [snapshot, setSnapshot] = useState<BootSnapshot | null>(null);
    const [vitals, setVitals] = useState<Record<string, VitalSample>>({});

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
        <div className="space-y-3">
            <Section title="Navigation (HTML)">
                <Row label="TTFB" value={ms(navigation?.ttfbMs)} />
                <Row label="response end" value={ms(navigation?.responseEndMs)} />
                <Row label="DOMContentLoaded" value={ms(navigation?.domContentLoadedMs)} />
                <Row label="load" value={ms(navigation?.loadEndMs)} />
            </Section>

            <Section title="App milestones">
                <Row label="main.tsx start" value={ms(marks['main-start'])} />
                <Row label="app render" value={ms(marks['app-render'])} />
                <Row label="session init (router)" value={ms(marks['session-initialized'])} />
            </Section>

            <Section title="Paint">
                <Row
                    label="FCP"
                    value={vitals.FCP ? `${Math.round(vitals.FCP.value)} ms (${vitals.FCP.rating})` : null}
                />
                <Row
                    label="LCP"
                    value={vitals.LCP ? `${Math.round(vitals.LCP.value)} ms (${vitals.LCP.rating})` : null}
                />
                <Row label="TTFB (vitals)" value={vitals.TTFB ? `${Math.round(vitals.TTFB.value)} ms` : null} />
            </Section>

            <Section title={`Assets (${cachedCount}/${assets.length} cached · ${kb(downloadedBytes)} downloaded)`}>
                {assets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">/assets/ 리소스 엔트리가 없습니다</p>
                ) : (
                    assets.map(a => (
                        <Row
                            key={a.name}
                            label={a.name}
                            value={
                                a.fromCache
                                    ? `cache · ${a.durationMs} ms`
                                    : `${kb(a.transferSize)} · ${a.durationMs} ms`
                            }
                        />
                    ))
                )}
            </Section>
        </div>
    );
};
