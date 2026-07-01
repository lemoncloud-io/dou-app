import { useState } from 'react';

import { RotateCw } from 'lucide-react';

import { ACCENT, ago, dur, hexToRgba, presenceColor } from '../../lib/stats';
import type { Watchlist } from '../../hooks/use-watchlist';

export interface WatchlistMasterDetailProps {
    wl: Watchlist;
}

/** 마스터(관측 유저 한 줄 목록) + 디테일(선택 유저 디바이스 목록 + reload). */
export default function WatchlistMasterDetail({ wl }: WatchlistMasterDetailProps) {
    const [hoverId, setHoverId] = useState<string | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const { observed, selectedUserId, selected } = wl;
    // 유저 마지막 활동 = 디바이스 중 가장 최근(min lastActiveAt). 디바이스 없으면 null.
    const userLastActive =
        selected && selected.devices.length ? Math.min(...selected.devices.map(d => d.lastActiveAt)) : null;

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
                    background: 'var(--sm-sidebar)',
                    border: '1px solid var(--sm-border)',
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
                        borderBottom: '1px solid var(--sm-border)',
                        background: 'var(--sm-panel)',
                        flexShrink: 0,
                    }}
                >
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '.05em',
                            color: 'var(--sm-text-5)',
                            textTransform: 'uppercase',
                        }}
                    >
                        Observed Users
                    </span>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: 'var(--sm-text-4)' }}>
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
                                    draggable
                                    onClick={() => wl.selectUser(u.id)}
                                    onMouseEnter={() => setHoverId(u.id)}
                                    onMouseLeave={() => setHoverId(null)}
                                    onDragStart={() => setDragId(u.id)}
                                    onDragEnd={() => {
                                        setDragId(null);
                                        setDragOverId(null);
                                    }}
                                    onDragOver={e => {
                                        e.preventDefault();
                                        if (dragId && dragOverId !== u.id) setDragOverId(u.id);
                                    }}
                                    onDrop={e => {
                                        e.preventDefault();
                                        if (dragId) wl.reorderUser(dragId, u.id);
                                        setDragId(null);
                                        setDragOverId(null);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '12px 14px 12px 13px',
                                        borderBottom: '1px solid var(--sm-raised-2)',
                                        borderLeft: `3px solid ${sel ? ACCENT : 'transparent'}`,
                                        background: sel
                                            ? hexToRgba(ACCENT, 0.12)
                                            : hoverId === u.id
                                              ? 'var(--sm-panel-2)'
                                              : 'transparent',
                                        cursor: dragId ? 'grabbing' : 'grab',
                                        opacity: dragId === u.id ? 0.4 : 1,
                                        boxShadow:
                                            dragOverId === u.id && dragId !== u.id ? `inset 0 2px 0 ${ACCENT}` : 'none',
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
                                                color: 'var(--sm-text)',
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
                                                color: 'var(--sm-text-6)',
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
                                            color: 'var(--sm-text-7)',
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
                                color: 'var(--sm-text-6)',
                                fontSize: 12,
                                lineHeight: 1.6,
                            }}
                        >
                            관측할 유저를 추가하세요
                            <br />
                            <span style={{ color: 'var(--sm-text-8)', fontSize: 11 }}>아래 + 추가 버튼을 누르세요</span>
                        </div>
                    )}
                </div>
                <div style={{ padding: '11px 14px', borderTop: '1px solid var(--sm-border)', flexShrink: 0 }}>
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
                    background: 'var(--sm-sidebar)',
                    border: '1px solid var(--sm-border)',
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
                        borderBottom: '1px solid var(--sm-border)',
                        background: 'var(--sm-panel)',
                        flexShrink: 0,
                    }}
                >
                    {selected ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span
                                style={{
                                    width: 9,
                                    height: 9,
                                    borderRadius: '50%',
                                    background: presenceColor(selected.presence),
                                    flexShrink: 0,
                                }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                                <span
                                    style={{
                                        fontWeight: 600,
                                        fontSize: 13,
                                        color: 'var(--sm-text)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {selected.name}
                                </span>
                                <span
                                    style={{
                                        fontFamily: "'Geist Mono',monospace",
                                        fontSize: 10.5,
                                        color: 'var(--sm-text-6)',
                                    }}
                                >
                                    {selected.id}
                                    {selected.code ? ` · ${selected.code}` : ''} · active{' '}
                                    {userLastActive != null ? ago(userLastActive) : '—'}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: '.05em',
                                color: 'var(--sm-text-5)',
                                textTransform: 'uppercase',
                            }}
                        >
                            User
                        </span>
                    )}
                    {selected ? (
                        <button
                            onClick={wl.reloadDevices}
                            title="디바이스 목록 새로고침"
                            aria-label="디바이스 목록 새로고침"
                            style={{
                                appearance: 'none',
                                background: 'var(--sm-panel-2)',
                                border: '1px solid var(--sm-border-2)',
                                borderRadius: 6,
                                cursor: 'pointer',
                                color: 'var(--sm-text-3)',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '4px 6px',
                                flexShrink: 0,
                            }}
                        >
                            <RotateCw size={12} />
                        </button>
                    ) : null}
                </div>

                {selected ? (
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '9px 16px',
                                borderBottom: '1px solid var(--sm-border)',
                                background: 'var(--sm-bg-deepest)',
                                flexShrink: 0,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    letterSpacing: '.05em',
                                    color: 'var(--sm-text-5)',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Devices
                            </span>
                            <span
                                style={{
                                    fontFamily: "'Geist Mono',monospace",
                                    fontSize: 11,
                                    color: 'var(--sm-text-4)',
                                }}
                            >
                                {selected.devices.length}
                            </span>
                        </div>
                        {selected.devices.length ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {selected.devices.map(d => {
                                    const dc = presenceColor(d.status);
                                    return (
                                        <div
                                            key={d.id}
                                            style={{
                                                padding: '14px 16px',
                                                borderBottom: '1px solid var(--sm-raised-2)',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginBottom: 6,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 9,
                                                        minWidth: 0,
                                                        flex: 1,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            width: 8,
                                                            height: 8,
                                                            borderRadius: '50%',
                                                            background: dc,
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <span
                                                        title={d.name}
                                                        style={{
                                                            fontWeight: 500,
                                                            fontFamily: "'Geist Mono',monospace",
                                                            fontSize: 12.5,
                                                            color: 'var(--sm-text)',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            minWidth: 0,
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
                                                        flexShrink: 0,
                                                        marginLeft: 8,
                                                    }}
                                                >
                                                    {d.status.toUpperCase()}
                                                </span>
                                            </div>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 8,
                                                    marginBottom: 5,
                                                    fontSize: 12,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        minWidth: 0,
                                                        color: d.viewing ? ACCENT : 'var(--sm-text-6)',
                                                    }}
                                                >
                                                    <span style={{ fontSize: 9 }}>●</span>
                                                    <span
                                                        style={{
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                        }}
                                                    >
                                                        {d.viewing ? `채널 ${d.viewing} 보는 중` : '보는 채널 없음'}
                                                    </span>
                                                </span>
                                                {d.viewing && d.viewingFor != null ? (
                                                    <span
                                                        style={{
                                                            fontFamily: "'Geist Mono',monospace",
                                                            fontSize: 10.5,
                                                            color: 'var(--sm-text-4)',
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        체류 {dur(d.viewingFor)}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div
                                                style={{
                                                    fontFamily: "'Geist Mono',monospace",
                                                    fontSize: 10.5,
                                                    color: 'var(--sm-text-6)',
                                                }}
                                            >
                                                {d.platform} · tick {d.tick} · active {ago(d.lastActiveAt)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div
                                style={{
                                    padding: '40px 18px',
                                    textAlign: 'center',
                                    color: 'var(--sm-text-6)',
                                    fontSize: 12,
                                }}
                            >
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
                            color: 'var(--sm-text-6)',
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
