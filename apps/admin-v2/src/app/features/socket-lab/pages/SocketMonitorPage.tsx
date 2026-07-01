import { useState } from 'react';

import { pct, THRESHOLDS } from '../lib/stats';
import { DEFAULT_WS_URL } from '../model/endpoint-presets';
import { useCanarySim } from '../hooks/use-canary-sim';
import { useLoadTest } from '../hooks/use-load-test';
import { useTheme } from '../hooks/use-theme';
import { useWatchlist } from '../hooks/use-watchlist';
import ErrorBoundary from '../components/ErrorBoundary';
import Header, { type Tab } from '../components/shell/Header';
import Sidebar from '../components/shell/Sidebar';
import ObserveTab from '../components/observe/ObserveTab';
import UserSearchModal from '../components/observe/UserSearchModal';
import ProbeTab from '../components/probe/ProbeTab';
import '../socket-monitor.css';

const FALLBACK_WS = 'wss://ws.lemoncloud.io/socket';

/** Socket Monitor 셸 — 사이드바 + 헤더(탭) + Observe/Probe 콘텐츠 + 검색 모달. */
export const SocketMonitorPage = () => {
    const liveMotion = true;
    const { theme, toggle } = useTheme();
    const wl = useWatchlist();
    const canary = useCanarySim(liveMotion);
    const load = useLoadTest();

    const [tab, setTab] = useState<Tab>('observe');
    const [endpoint, setEndpoint] = useState<string>(DEFAULT_WS_URL || FALLBACK_WS);

    // 전역 상태 배지 — 워치리스트 디바이스 status + canary fanout/loss 종합.
    const counts = { green: 0, yellow: 0, red: 0 };
    wl.observed.forEach(u => u.devices.forEach(d => (counts[d.status] += 1)));
    const fP95 = Math.round(pct(canary.metrics.fanout?.series ?? [], 95));
    const probeBad =
        fP95 > THRESHOLDS.fanout[1] ||
        (canary.metrics.loss && pct(canary.metrics.loss.series, 50) > THRESHOLDS.loss[1]);
    const probeWarn = fP95 > THRESHOLDS.fanout[0];
    let badgeColor = '#3fb950';
    let badgeText = 'HEALTHY';
    if (counts.red > 0 || probeBad) {
        badgeColor = '#f85149';
        badgeText = 'DEGRADED';
    } else if (counts.yellow > 0 || probeWarn) {
        badgeColor = '#d29922';
        badgeText = 'WATCH';
    }

    return (
        <ErrorBoundary>
            <div className={theme === 'light' ? 'sm-root sm-light' : 'sm-root'}>
                <Sidebar endpoint={endpoint} theme={theme} onToggleTheme={toggle} />
                <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <Header
                        tab={tab}
                        setTab={setTab}
                        endpoint={endpoint}
                        setEndpoint={setEndpoint}
                        badgeText={badgeText}
                        badgeColor={badgeColor}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        {tab === 'observe' ? (
                            <ObserveTab wl={wl} />
                        ) : (
                            <ProbeTab canary={canary} load={load} endpoint={endpoint} />
                        )}
                    </div>
                </main>
                {wl.searchOpen ? <UserSearchModal wl={wl} /> : null}
            </div>
        </ErrorBoundary>
    );
};
