import { ACCENT, hexToRgba } from '../../../lib/stats';
import type { Sandbox } from '../../../hooks/use-sandbox';
import ClientPanel from './ClientPanel';

export interface SandboxViewProps {
    sandbox: Sandbox;
}

const ACCENT_SOFT = hexToRgba(ACCENT, 0.12);
const ACCENT_BORDER = hexToRgba(ACCENT, 0.35);

const cellStyle = (v: number | 'loss' | undefined, self: boolean) => {
    if (self) return { txt: '', color: 'transparent', bg: 'var(--sm-panel-2)' };
    if (v == null) return { txt: '—', color: 'var(--sm-text-8)', bg: 'transparent' };
    if (v === 'loss') return { txt: 'loss', color: '#f85149', bg: 'rgba(248,81,73,0.12)' };
    const c = v > 180 ? '#f85149' : v > 90 ? '#d29922' : '#3fb950';
    return { txt: `${v}ms`, color: c, bg: hexToRgba(c, 0.12) };
};

/** Gateway Sandbox — 툴바 + 클라 그리드(최대4) + cross-client latency 매트릭스. */
export default function SandboxView({ sandbox }: SandboxViewProps) {
    const { clients, controllers, matrix, showMatrix } = sandbox;
    const gridCols = clients.length <= 1 ? '1fr' : '1fr 1fr';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* toolbar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--sm-panel)',
                    border: '1px solid var(--sm-border)',
                    borderRadius: 10,
                    padding: '13px 18px',
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>Gateway Sandbox</span>
                    <span style={{ fontSize: 11.5, color: 'var(--sm-text-6)' }}>
                        클라이언트별 토큰으로 인증해 게이트웨이를 직접 호출·검증 · 실 WebSocket
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: 'var(--sm-text-4)' }}>
                        {clients.length} / 4
                    </span>
                    <button
                        onClick={sandbox.disconnectAll}
                        style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 11.5,
                            fontWeight: 500,
                            borderRadius: 7,
                            padding: '7px 12px',
                            background: 'var(--sm-panel-2)',
                            border: '1px solid var(--sm-border-2)',
                            color: 'var(--sm-text-3)',
                        }}
                    >
                        모두 연결 해제
                    </button>
                    {sandbox.canAdd ? (
                        <button
                            onClick={sandbox.addClient}
                            style={{
                                appearance: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontSize: 11.5,
                                fontWeight: 600,
                                borderRadius: 7,
                                padding: '7px 13px',
                                background: ACCENT_SOFT,
                                border: `1px solid ${ACCENT_BORDER}`,
                                color: ACCENT,
                            }}
                        >
                            + 클라이언트 추가
                        </button>
                    ) : null}
                </div>
            </div>

            {clients.length === 0 ? (
                <div
                    style={{
                        border: '1px dashed var(--sm-border-2)',
                        borderRadius: 12,
                        padding: '60px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 14,
                        background: 'var(--sm-panel)',
                    }}
                >
                    <span style={{ fontSize: 13, color: 'var(--sm-text-5)' }}>클라이언트를 추가해 시작하세요</span>
                    <button
                        onClick={sandbox.addClient}
                        style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 13,
                            fontWeight: 600,
                            borderRadius: 9,
                            padding: '11px 20px',
                            background: ACCENT,
                            color: 'var(--sm-on-accent, #0a0d12)',
                            border: 'none',
                        }}
                    >
                        + 클라이언트 추가
                    </button>
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, alignItems: 'start' }}>
                        {clients.map(c => {
                            const ctrl = controllers.get(c.id);
                            return ctrl ? (
                                <ClientPanel key={c.id} c={c} ctrl={ctrl} onRemove={() => sandbox.removeClient(c.id)} />
                            ) : null;
                        })}
                    </div>

                    {showMatrix ? (
                        <div
                            style={{
                                background: 'var(--sm-panel)',
                                border: '1px solid var(--sm-border)',
                                borderRadius: 10,
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '11px 16px',
                                    borderBottom: '1px solid var(--sm-border)',
                                    background: 'var(--sm-deep)',
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
                                    Cross-client Latency Matrix{' '}
                                    <span
                                        style={{
                                            fontWeight: 400,
                                            textTransform: 'none',
                                            letterSpacing: 0,
                                            color: 'var(--sm-text-6)',
                                        }}
                                    >
                                        send → receive · recv E2E
                                    </span>
                                </span>
                                <button
                                    onClick={sandbox.toggleMatrix}
                                    style={{
                                        appearance: 'none',
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                        fontSize: 11,
                                        fontWeight: 500,
                                        borderRadius: 6,
                                        padding: '5px 11px',
                                        background: 'var(--sm-panel-2)',
                                        border: '1px solid var(--sm-border-2)',
                                        color: 'var(--sm-text-3)',
                                    }}
                                >
                                    숨기기
                                </button>
                            </div>
                            <div style={{ padding: 16, overflowX: 'auto' }}>
                                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <span style={{ width: 88, fontSize: 10, color: 'var(--sm-text-6)' }}>
                                            from ↓ / to →
                                        </span>
                                        {clients.map(h => (
                                            <span
                                                key={h.id}
                                                style={{
                                                    width: 70,
                                                    textAlign: 'center',
                                                    fontFamily: "'Geist Mono',monospace",
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    color: h.color,
                                                }}
                                            >
                                                {h.letter}
                                            </span>
                                        ))}
                                    </div>
                                    {clients.map(r => (
                                        <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <span
                                                style={{
                                                    width: 88,
                                                    fontFamily: "'Geist Mono',monospace",
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    color: r.color,
                                                }}
                                            >
                                                {r.letter}
                                            </span>
                                            {clients.map(col => {
                                                const self = r.id === col.id;
                                                const cell = cellStyle(
                                                    self ? undefined : matrix[`${r.letter}>${col.letter}`],
                                                    self
                                                );
                                                return (
                                                    <span
                                                        key={col.id}
                                                        style={{
                                                            width: 70,
                                                            height: 32,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            borderRadius: 6,
                                                            background: cell.bg,
                                                            color: cell.color,
                                                            fontFamily: "'Geist Mono',monospace",
                                                            fontSize: 11.5,
                                                        }}
                                                    >
                                                        {cell.txt}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
