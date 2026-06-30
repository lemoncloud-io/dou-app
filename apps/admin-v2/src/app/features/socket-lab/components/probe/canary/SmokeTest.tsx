import { useState } from 'react';

import { getActiveServerContext, getActiveServerIdentityToken } from '@chatic/web-core';

import { ACCENT, hexToRgba } from '../../../lib/stats';
import { runCanarySmoke, type SmokeLine, type SmokeResult } from '../../../runtime/canary-smoke';

export interface SmokeTestProps {
    /** 폴백 WS URL(헤더 endpoint). activeServer.wss 우선. */
    endpoint: string;
}

/** relay 토큰(localStorage) 폴백 — activeServer.identityToken이 비었을 때. */
const readRelayToken = (): string | null => {
    try {
        const raw = localStorage.getItem('chatic-relay-token');
        if (!raw) return null;
        return (JSON.parse(raw) as { Token?: { identityToken?: string } })?.Token?.identityToken ?? null;
    } catch {
        return null;
    }
};

const verdictColor = (v: SmokeResult['verdict']) => (v === 'ok' ? '#3fb950' : v === 'fail' ? '#f85149' : '#d29922');
const lineColor = (l: SmokeLine['level']) => (l === 'error' ? '#f85149' : l === 'warn' ? '#d29922' : '#9aa4af');

/** 임시 진단 패널 — 실 WS 2-클라이언트 연결/echo 검증(서버 선결조건 확인용). */
export default function SmokeTest({ endpoint }: SmokeTestProps) {
    const [running, setRunning] = useState(false);
    const [lines, setLines] = useState<SmokeLine[]>([]);
    const [result, setResult] = useState<SmokeResult | null>(null);

    const run = async () => {
        setRunning(true);
        setLines([]);
        setResult(null);
        const ctx = getActiveServerContext();
        // 동작하는 useWebSocketV2와 동일하게 v2 파라미터(?v2=) 부착 — 없으면 서버가 v2 프로토콜 미적용(요청 408).
        const base = ctx?.wss || endpoint;
        const wsUrl = base ? base + (base.includes('?') ? '&' : '?') + 'v2=' : base;
        // 토큰: activeServer → 실패 시 relay 토큰(localStorage) 폴백.
        const token = getActiveServerIdentityToken() ?? readRelayToken();
        const res = await runCanarySmoke({ wsUrl, token, onLog: line => setLines(prev => [...prev, line]) });
        setResult(res);
        setRunning(false);
    };

    return (
        <div style={{ background: '#0c1118', border: '1px solid #1a212c', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid #1a212c', background: '#0e131b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: '#6b747f', textTransform: 'uppercase' }}>연결 스모크 테스트</span>
                    <span style={{ fontSize: 10.5, color: '#5a636e' }}>실 WS pub/sub 2개 · broadcast/echo 검증 (진단용)</span>
                </div>
                <button
                    onClick={run}
                    disabled={running}
                    style={{ appearance: 'none', cursor: running ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, borderRadius: 7, padding: '7px 14px', background: running ? '#11161f' : hexToRgba(ACCENT, 0.12), border: `1px solid ${running ? '#1c2530' : hexToRgba(ACCENT, 0.35)}`, color: running ? '#5a636e' : ACCENT }}
                >
                    {running ? '실행 중…' : '▶ 스모크 테스트'}
                </button>
            </div>

            {result ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #141a23', background: hexToRgba(verdictColor(result.verdict), 0.08) }}>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', color: verdictColor(result.verdict), border: `1px solid ${hexToRgba(verdictColor(result.verdict), 0.4)}`, borderRadius: 6, padding: '3px 10px' }}>{result.verdict.toUpperCase()}</span>
                    <span style={{ fontSize: 11.5, color: '#c2cad3', lineHeight: 1.5 }}>{result.detail}</span>
                </div>
            ) : null}

            {lines.length ? (
                <div style={{ maxHeight: 260, overflowY: 'auto', padding: '8px 0' }}>
                    {lines.map((l, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8, padding: '3px 16px', fontFamily: "'Geist Mono',monospace", fontSize: 11.5 }}>
                            <span style={{ color: '#5a636e' }}>{l.t}</span>
                            <span style={{ color: lineColor(l.level), whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{l.text}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ padding: '20px 16px', fontSize: 11.5, color: '#5a636e' }}>로그인 상태에서 실행 — 어드민 토큰으로 실제 WS에 연결해 sub가 pub 메시지를 받는지/타임스탬프가 보존되는지 확인합니다.</div>
            )}
        </div>
    );
}
