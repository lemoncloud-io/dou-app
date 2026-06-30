import { useState } from 'react';

import { RotateCw } from 'lucide-react';

import { ACCENT, ago, hexToRgba, presenceColor } from '../../lib/stats';
import type { Watchlist } from '../../hooks/use-watchlist';

export interface WatchlistMasterDetailProps {
    wl: Watchlist;
}

/** 마스터(관측 유저 한 줄 목록) + 디테일(선택 유저 디바이스 목록 + reload). */
export default function WatchlistMasterDetail({ wl }: WatchlistMasterDetailProps) {
    const [hoverId, setHoverId] = useState<string | null>(null);
    const { observed, selectedUserId, selected } = wl;

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '320px 1fr',
                gap: 14,
                alignItems: 'stretch',
                flex: 1,
                minHeight: 340,
            }}
        >
            {/* MASTER */}
            <div
                style={{
                    background: '#0c1118',
                    border: '1px solid #1a212c',
                    borderRadius: 10,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '11px 14px',
                        borderBottom: '1px solid #1a212c',
                        background: '#0e131b',
                        flexShrink: 0,
                    }}
                >
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '.05em',
                            color: '#6b747f',
                            textTransform: 'uppercase',
                        }}
                    >
                        Observed Users
                    </span>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: '#7d8590' }}>
                        {observed.length}
                    </span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {observed.length ? (
                        observed.map(u => {
                            const sel = u.id === selectedUserId;
                            return (
                                <div
                                    key={u.id}
                                    onClick={() => wl.selectUser(u.id)}
                                    onMouseEnter={() => setHoverId(u.id)}
                                    onMouseLeave={() => setHoverId(null)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '12px 14px 12px 13px',
                                        borderBottom: '1px solid #141a23',
                                        borderLeft: `3px solid ${sel ? ACCENT : 'transparent'}`,
                                        background: sel
                                            ? hexToRgba(ACCENT, 0.12)
                                            : hoverId === u.id
                                              ? '#11161f'
                                              : 'transparent',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: presenceColor(u.presence),
                                            flexShrink: 0,
                                        }}
                                    />
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 1,
                                            minWidth: 0,
                                            flex: 1,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontWeight: 500,
                                                color: '#e6edf3',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {u.name}
                                        </span>
                                        <span
                                            style={{
                                                fontFamily: "'Geist Mono',monospace",
                                                fontSize: 10,
                                                color: '#5a636e',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {u.id.slice(0, 8)} · {u.devices.length} dev
                                        </span>
                                    </div>
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            wl.removeUser(u.id);
                                        }}
                                        title="관측 해제"
                                        style={{
                                            appearance: 'none',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: '#4b545f',
                                            fontSize: 14,
                                            padding: '2px 4px',
                                            flexShrink: 0,
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            );
                        })
                    ) : (
                        <div
                            style={{
                                padding: '36px 18px',
                                textAlign: 'center',
                                color: '#5a636e',
                                fontSize: 12,
                                lineHeight: 1.6,
                            }}
                        >
                            관측할 유저를 추가하세요
                            <br />
                            <span style={{ color: '#3f4751', fontSize: 11 }}>아래 + 추가 버튼을 누르세요</span>
                        </div>
                    )}
                </div>
                <div style={{ padding: '11px 14px', borderTop: '1px solid #1a212c', flexShrink: 0 }}>
                    <button
                        onClick={wl.openSearch}
                        style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            width: '100%',
                            fontFamily: 'inherit',
                            fontSize: 12,
                            fontWeight: 500,
                            borderRadius: 7,
                            padding: 9,
                            background: hexToRgba(ACCENT, 0.12),
                            border: `1px solid ${hexToRgba(ACCENT, 0.35)}`,
                            color: ACCENT,
                        }}
                    >
                        + 관측 유저 추가
                    </button>
                </div>
            </div>

            {/* DETAIL */}
            <div
                style={{
                    background: '#0c1118',
                    border: '1px solid #1a212c',
                    borderRadius: 10,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '11px 14px',
                        borderBottom: '1px solid #1a212c',
                        background: '#0e131b',
                        flexShrink: 0,
                    }}
                >
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '.05em',
                            color: '#6b747f',
                            textTransform: 'uppercase',
                        }}
                    >
                        Devices
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: '#7d8590' }}>
                            {selected ? selected.devices.length : 0}
                        </span>
                        {selected ? (
                            <button
                                onClick={wl.reloadDevices}
                                title="디바이스 목록 새로고침"
                                aria-label="디바이스 목록 새로고침"
                                style={{
                                    appearance: 'none',
                                    background: '#11161f',
                                    border: '1px solid #1c2530',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    color: '#9aa4af',
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '4px 6px',
                                }}
                            >
                                <RotateCw size={12} />
                            </button>
                        ) : null}
                    </div>
                </div>

                {selected ? (
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 9,
                                padding: '12px 16px',
                                borderBottom: '1px solid #1a212c',
                                background: '#0b0f16',
                                flexShrink: 0,
                            }}
                        >
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: presenceColor(selected.presence),
                                }}
                            />
                            <span style={{ fontWeight: 600, color: '#e6edf3' }}>{selected.name}</span>
                            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, color: '#5a636e' }}>
                                관측 대상 · {selected.id}
                            </span>
                        </div>
                        {selected.devices.length ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {selected.devices.map(d => {
                                    const dc = presenceColor(d.status);
                                    return (
                                        <div
                                            key={d.id}
                                            style={{ padding: '14px 16px', borderBottom: '1px solid #141a23' }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginBottom: 6,
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                                    <span
                                                        style={{
                                                            width: 8,
                                                            height: 8,
                                                            borderRadius: '50%',
                                                            background: dc,
                                                        }}
                                                    />
                                                    <span
                                                        style={{
                                                            fontWeight: 500,
                                                            fontFamily: "'Geist Mono',monospace",
                                                            fontSize: 12.5,
                                                            color: '#e6edf3',
                                                        }}
                                                    >
                                                        {d.name}
                                                    </span>
                                                </div>
                                                <span
                                                    style={{
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        letterSpacing: '.05em',
                                                        color: dc,
                                                        background: hexToRgba(dc, 0.13),
                                                        borderRadius: 5,
                                                        padding: '2px 8px',
                                                    }}
                                                >
                                                    {d.status.toUpperCase()}
                                                </span>
                                            </div>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    marginBottom: 5,
                                                    fontSize: 12,
                                                    color: d.viewing ? ACCENT : '#5a636e',
                                                }}
                                            >
                                                <span style={{ fontSize: 9 }}>●</span>
                                                {d.viewing ? `보는 중 ${d.viewing}` : '보는 채널 없음'}
                                            </div>
                                            <div
                                                style={{
                                                    fontFamily: "'Geist Mono',monospace",
                                                    fontSize: 10.5,
                                                    color: '#5a636e',
                                                }}
                                            >
                                                {d.platform} · tick {d.tick} · active {ago(d.lastActiveAt)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ padding: '40px 18px', textAlign: 'center', color: '#5a636e', fontSize: 12 }}>
                                이 유저의 디바이스 없음
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#5a636e',
                            fontSize: 12,
                        }}
                    >
                        좌측에서 관측 유저를 선택하세요
                    </div>
                )}
            </div>
        </div>
    );
}
