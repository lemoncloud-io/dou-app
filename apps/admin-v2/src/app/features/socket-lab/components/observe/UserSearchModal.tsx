import { useState } from 'react';

import { ACCENT, hexToRgba, presenceColor } from '../../lib/stats';
import type { Watchlist } from '../../hooks/use-watchlist';
import type { UserSearchType } from '../../mock/observed-users';

export interface UserSearchModalProps {
    wl: Watchlist;
}

/** 관측 유저 검색 모달 — id/name 드롭다운 + 입력 + 돋보기 + 페이지네이션. */
export default function UserSearchModal({ wl }: UserSearchModalProps) {
    const [hoverId, setHoverId] = useState<string | null>(null);
    const shown = wl.searchShown;

    return (
        <div
            onClick={wl.closeSearch}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(4,7,11,.7)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '9vh',
                zIndex: 50,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 560,
                    maxWidth: '92vw',
                    background: '#0e131b',
                    border: '1px solid #232c38',
                    borderRadius: 14,
                    boxShadow: '0 24px 64px rgba(0,0,0,.55)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '78vh',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '15px 18px',
                        borderBottom: '1px solid #1a212c',
                    }}
                >
                    <span style={{ fontSize: 14, fontWeight: 600 }}>관측할 유저 검색</span>
                    <button
                        onClick={wl.closeSearch}
                        aria-label="닫기"
                        style={{
                            appearance: 'none',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6b747f',
                            fontSize: 18,
                            padding: '0 4px',
                        }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 8, padding: '14px 18px', borderBottom: '1px solid #1a212c' }}>
                    <select
                        value={wl.searchType}
                        onChange={e => wl.setSearchType(e.target.value as UserSearchType)}
                        style={{
                            appearance: 'none',
                            background: '#11161f',
                            border: '1px solid #232c38',
                            borderRadius: 8,
                            color: '#c2cad3',
                            fontFamily: 'inherit',
                            fontSize: 12.5,
                            padding: '0 12px',
                            cursor: 'pointer',
                            outline: 'none',
                        }}
                    >
                        <option value="id">id</option>
                        <option value="name">name</option>
                    </select>
                    <input
                        autoFocus
                        value={wl.searchQuery}
                        onChange={e => wl.setSearchQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') wl.runSearch();
                        }}
                        placeholder="검색어 입력…"
                        style={{
                            flex: 1,
                            background: '#11161f',
                            border: '1px solid #232c38',
                            borderRadius: 8,
                            color: '#e6edf3',
                            fontFamily: "'Geist Mono',monospace",
                            fontSize: 12.5,
                            padding: '9px 12px',
                            outline: 'none',
                        }}
                    />
                    <button
                        onClick={wl.runSearch}
                        aria-label="검색"
                        style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            width: 40,
                            borderRadius: 8,
                            background: ACCENT,
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="7" cy="7" r="5" stroke="#0a0d12" strokeWidth="1.8" />
                            <line
                                x1="11"
                                y1="11"
                                x2="14.5"
                                y2="14.5"
                                stroke="#0a0d12"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {wl.searchLoading && !shown.length ? (
                        <div style={{ padding: '40px 18px', textAlign: 'center', color: '#5a636e', fontSize: 12.5 }}>불러오는 중…</div>
                    ) : wl.searchError ? (
                        <div style={{ padding: '40px 18px', textAlign: 'center', color: '#f85149', fontSize: 12.5 }}>{wl.searchError}</div>
                    ) : shown.length ? (
                        <div>
                            {shown.map(u => {
                                const added = wl.observedIds.has(u.id);
                                return (
                                    <div
                                        key={u.id}
                                        onMouseEnter={() => setHoverId(u.id)}
                                        onMouseLeave={() => setHoverId(null)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 11,
                                            padding: '11px 18px',
                                            borderBottom: '1px solid #141a23',
                                            background: hoverId === u.id ? '#11161f' : 'transparent',
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
                                                    fontSize: 10.5,
                                                    color: '#5a636e',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                {u.id.slice(0, 10)}
                                                {u.code ? ` · ${u.code}` : ''} · {u.devices.length} dev
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => wl.addUser(u)}
                                            disabled={added}
                                            style={{
                                                appearance: 'none',
                                                cursor: added ? 'default' : 'pointer',
                                                fontFamily: 'inherit',
                                                fontSize: 11.5,
                                                fontWeight: 600,
                                                borderRadius: 6,
                                                padding: '6px 13px',
                                                background: added ? '#11161f' : hexToRgba(ACCENT, 0.12),
                                                border: `1px solid ${added ? '#1c2530' : hexToRgba(ACCENT, 0.35)}`,
                                                color: added ? '#4b545f' : ACCENT,
                                                flexShrink: 0,
                                            }}
                                        >
                                            {added ? '추가됨' : '+ 추가'}
                                        </button>
                                    </div>
                                );
                            })}
                            {wl.canLoadMore ? (
                                <button
                                    onClick={wl.loadMore}
                                    style={{
                                        appearance: 'none',
                                        cursor: 'pointer',
                                        width: '100%',
                                        fontFamily: 'inherit',
                                        fontSize: 12,
                                        color: '#9aa4af',
                                        background: 'none',
                                        border: 'none',
                                        padding: 14,
                                        borderTop: '1px solid #141a23',
                                    }}
                                >
                                    더 보기 ({shown.length}/{wl.searchTotal})
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <div style={{ padding: '40px 18px', textAlign: 'center', color: '#5a636e', fontSize: 12.5 }}>
                            검색 결과 없음
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
