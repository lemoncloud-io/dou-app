import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DEFAULT_WS_URL } from '../model/endpoint-presets';
import { fetchObservedUsers } from '../api/userApi';
import { useLoadTest } from '../hooks/use-load-test';
import { useSandbox } from '../hooks/use-sandbox';
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

export const SocketMonitorPage = () => {
    const { theme, toggle } = useTheme();
    const [tab, setTab] = useState<Tab>('observe');
    const [endpoint, setEndpoint] = useState<string>(DEFAULT_WS_URL || FALLBACK_WS);

    const wl = useWatchlist();
    const sandbox = useSandbox(endpoint);
    const load = useLoadTest();

    // Deep link from report-logs: `/socket-lab?observe=<uid>` resolves the user and adds it to the
    // Observe watchlist (tab already defaults to 'observe'). Handled once per uid.
    const [searchParams] = useSearchParams();
    const observeUid = searchParams.get('observe');
    const observedHandled = useRef<string | null>(null);
    useEffect(() => {
        if (!observeUid || observedHandled.current === observeUid || wl.observedIds.has(observeUid)) {
            return;
        }
        observedHandled.current = observeUid;
        void fetchObservedUsers({ type: 'id', query: observeUid, stage: wl.stage }).then(res => {
            const user = res.list[0];
            if (user) wl.addUser(user);
        });
    }, [observeUid, wl]);

    const counts = { green: 0, yellow: 0, red: 0 };
    wl.observed.forEach(u => u.devices.forEach(d => (counts[d.status] += 1)));
    let badgeColor = '#3fb950';
    let badgeText = 'HEALTHY';
    if (counts.red > 0) {
        badgeColor = '#f85149';
        badgeText = 'DEGRADED';
    } else if (counts.yellow > 0) {
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
                        {tab === 'observe' ? <ObserveTab wl={wl} /> : <ProbeTab sandbox={sandbox} load={load} />}
                    </div>
                </main>
                {wl.searchOpen ? <UserSearchModal wl={wl} /> : null}
            </div>
        </ErrorBoundary>
    );
};
