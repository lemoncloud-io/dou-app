import { ACCENT, hexToRgba } from '../../lib/stats';

export type ProbeMode = 'sandbox' | 'load';

export interface ModeToggleProps {
    mode: ProbeMode;
    setMode(m: ProbeMode): void;
    sandboxActive: boolean;
}

export default function ModeToggle({ mode, setMode, sandboxActive }: ModeToggleProps) {
    const style = (on: boolean) => ({
        appearance: 'none' as const,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12.5,
        fontWeight: 500,
        borderRadius: 8,
        padding: '8px 15px',
        background: on ? hexToRgba(ACCENT, 0.12) : 'transparent',
        border: `1px solid ${on ? hexToRgba(ACCENT, 0.35) : 'var(--sm-border-2)'}`,
        color: on ? 'var(--sm-text)' : 'var(--sm-text-4)',
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
                onClick={() => setMode('sandbox')}
                style={{ ...style(mode === 'sandbox'), display: 'flex', alignItems: 'center', gap: 8 }}
            >
                <span
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: sandboxActive ? '#3fb950' : 'var(--sm-text-6)',
                        animation: sandboxActive ? 'scPulse 1.4s ease-in-out infinite' : 'none',
                    }}
                />
                Sandbox <span style={{ color: 'var(--sm-text-6)', fontSize: 11 }}>(gateway)</span>
            </button>
            <button onClick={() => setMode('load')} style={style(mode === 'load')}>
                Load test <span style={{ color: 'var(--sm-text-6)', fontSize: 11 }}>(on-demand)</span>
            </button>
        </div>
    );
}
