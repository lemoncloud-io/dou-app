import { LogOut } from 'lucide-react';

import { useSessionIdentity, useSessionLogout } from '@chatic/web-core';

import { ACCENT, hexToRgba } from '../../lib/stats';

export interface SidebarProps {
    endpoint: string;
}

/** 디자인 셸 사이드바 — 브랜드 + nav 1 + 푸터(계정/로그아웃/엔드포인트/build). */
export default function Sidebar({ endpoint }: SidebarProps) {
    const identity = useSessionIdentity();
    const logout = useSessionLogout();

    return (
        <aside
            style={{
                width: 218,
                flexShrink: 0,
                background: '#0c1118',
                borderRight: '1px solid #161c25',
                display: 'flex',
                flexDirection: 'column',
                padding: '18px 14px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px 18px' }}>
                <div
                    style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: ACCENT,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#0a0d12' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: '-.01em' }}>Socket Monitor</span>
                    <span style={{ fontSize: 10.5, color: '#5a636e', letterSpacing: '.04em' }}>REALTIME INFRA</span>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 11px',
                    borderRadius: 8,
                    background: hexToRgba(ACCENT, 0.12),
                    color: '#e6edf3',
                    fontWeight: 500,
                }}
            >
                <span
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: ACCENT,
                        animation: 'scPulse 1.6s ease-in-out infinite',
                        flexShrink: 0,
                    }}
                />
                <span>Socket Monitor</span>
            </div>

            <div
                style={{
                    marginTop: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '12px 8px 2px',
                    borderTop: '1px solid #161c25',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span
                        style={{
                            fontSize: 11.5,
                            color: '#9aa4af',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {identity.userName || 'Admin'}
                    </span>
                    <button
                        type="button"
                        onClick={() => logout()}
                        aria-label="로그아웃"
                        title="로그아웃"
                        style={{
                            appearance: 'none',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6b747f',
                            display: 'flex',
                            flexShrink: 0,
                            padding: 2,
                        }}
                    >
                        <LogOut size={15} />
                    </button>
                </div>
                <span style={{ fontSize: 10, color: '#4b545f', letterSpacing: '.06em', marginTop: 4 }}>ENDPOINT</span>
                <span
                    style={{
                        fontFamily: "'Geist Mono',monospace",
                        fontSize: 10.5,
                        color: '#7d8590',
                        wordBreak: 'break-all',
                    }}
                >
                    {endpoint}
                </span>
                <span style={{ fontSize: 10, color: '#3f4751', marginTop: 6 }}>admin-v2 · build 2026.06</span>
            </div>
        </aside>
    );
}
