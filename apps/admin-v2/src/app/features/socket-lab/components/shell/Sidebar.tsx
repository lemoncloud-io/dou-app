import { LogOut, Moon, Sun } from 'lucide-react';

// useSessionLogout from app-runtime (not web-core): notifies the socket (`auth.logout`) before the
// local teardown, so the RuntimeAuthHost relay session does not linger server-side.
import { useSessionLogout, useRuntimeProfile } from '@chatic/app-runtime';

import type { Theme } from '../../hooks/use-theme';
import { ACCENT, hexToRgba } from '../../lib/stats';

export interface SidebarProps {
    endpoint: string;
    theme: Theme;
    onToggleTheme: () => void;
}

export default function Sidebar({ endpoint, theme, onToggleTheme }: SidebarProps) {
    // Reactive display name, incl. profile-cache updates (a name edit fans out); the session
    // identity layer (`useSessionIdentity`) carries only ids/flags, not display fields.
    const { userName } = useRuntimeProfile();
    const logout = useSessionLogout();

    return (
        <aside
            style={{
                width: 218,
                flexShrink: 0,
                background: 'var(--sm-sidebar)',
                borderRight: '1px solid var(--sm-raised-3)',
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
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--sm-bg)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: '-.01em' }}>Socket Monitor</span>
                    <span style={{ fontSize: 10.5, color: 'var(--sm-text-6)', letterSpacing: '.04em' }}>
                        REALTIME INFRA
                    </span>
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
                    color: 'var(--sm-text)',
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
                    borderTop: '1px solid var(--sm-raised-3)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span
                        style={{
                            fontSize: 11.5,
                            color: 'var(--sm-text-3)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {userName === 'Unknown' ? 'Admin' : userName}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <button
                            type="button"
                            onClick={onToggleTheme}
                            aria-label={theme === 'dark' ? '라이트 모드' : '다크 모드'}
                            title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
                            style={{
                                appearance: 'none',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--sm-text-5)',
                                display: 'flex',
                                padding: 2,
                            }}
                        >
                            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                        </button>
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
                                color: 'var(--sm-text-5)',
                                display: 'flex',
                                padding: 2,
                            }}
                        >
                            <LogOut size={15} />
                        </button>
                    </div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--sm-text-7)', letterSpacing: '.06em', marginTop: 4 }}>
                    ENDPOINT
                </span>
                <span
                    style={{
                        fontFamily: "'Geist Mono',monospace",
                        fontSize: 10.5,
                        color: 'var(--sm-text-4)',
                        wordBreak: 'break-all',
                    }}
                >
                    {endpoint}
                </span>
                <span style={{ fontSize: 10, color: 'var(--sm-text-8)', marginTop: 6 }}>admin-v2 · build 2026.06</span>
            </div>
        </aside>
    );
}
