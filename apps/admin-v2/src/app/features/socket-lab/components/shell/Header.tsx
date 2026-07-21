import { useState } from 'react';

import { ACCENT, hexToRgba } from '../../lib/stats';

export type Tab = 'observe' | 'probe';

export interface HeaderProps {
    tab: Tab;
    setTab(t: Tab): void;
    endpoint: string;
    setEndpoint(v: string): void;
    badgeText: string;
    badgeColor: string;
}

export default function Header({ tab, setTab, endpoint, setEndpoint, badgeText, badgeColor }: HeaderProps) {
    const [focused, setFocused] = useState(false);
    const tabBtn = (key: Tab, label: string) => {
        const active = tab === key;
        const color = active ? 'var(--sm-text)' : 'var(--sm-text-5)';
        return (
            <button
                onClick={() => setTab(key)}
                style={{
                    appearance: 'none',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    height: '100%',
                    padding: '0 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontFamily: 'inherit',
                    fontSize: 13.5,
                    fontWeight: 500,
                    color,
                    borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`,
                    transition: 'color .15s',
                }}
            >
                <span style={{ fontSize: 9, color }}>●</span> {label}
            </button>
        );
    };

    return (
        <header
            style={{
                height: 54,
                flexShrink: 0,
                borderBottom: '1px solid var(--sm-raised-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 22px',
                background: 'var(--sm-bg)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: '100%' }}>
                {tabBtn('observe', 'Observe')}
                {tabBtn('probe', 'Probe')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 10, color: 'var(--sm-text-7)', letterSpacing: '.05em' }}>WS</span>
                    <input
                        value={endpoint}
                        onChange={e => setEndpoint(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        spellCheck={false}
                        title="WebSocket 엔드포인트 — 편집 가능"
                        style={{
                            fontFamily: "'Geist Mono',monospace",
                            fontSize: 11.5,
                            color: focused ? 'var(--sm-text)' : 'var(--sm-text-3)',
                            background: 'var(--sm-panel-2)',
                            border: `1px solid ${focused ? ACCENT : 'var(--sm-border-2)'}`,
                            borderRadius: 6,
                            padding: '5px 10px',
                            width: 248,
                            outline: 'none',
                            transition: 'border-color .15s,color .15s',
                        }}
                    />
                </div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        background: hexToRgba(badgeColor, 0.1),
                        border: `1px solid ${hexToRgba(badgeColor, 0.28)}`,
                        borderRadius: 20,
                        padding: '5px 12px 5px 10px',
                    }}
                >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: badgeColor }} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.03em', color: badgeColor }}>
                        {badgeText}
                    </span>
                </div>
            </div>
        </header>
    );
}
