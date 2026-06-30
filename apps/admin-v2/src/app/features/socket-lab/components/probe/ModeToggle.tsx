import { ACCENT, hexToRgba } from '../../lib/stats';

export type ProbeMode = 'canary' | 'load';

export interface ModeToggleProps {
    mode: ProbeMode;
    setMode(m: ProbeMode): void;
}

/** Canary | Load test 모드 토글. */
export default function ModeToggle({ mode, setMode }: ModeToggleProps) {
    const style = (on: boolean) => ({
        appearance: 'none' as const,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12.5,
        fontWeight: 500,
        borderRadius: 8,
        padding: '8px 15px',
        background: on ? hexToRgba(ACCENT, 0.12) : 'transparent',
        border: `1px solid ${on ? hexToRgba(ACCENT, 0.35) : '#1c2530'}`,
        color: on ? '#e6edf3' : '#7d8590',
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
                onClick={() => setMode('canary')}
                style={{ ...style(mode === 'canary'), display: 'flex', alignItems: 'center', gap: 8 }}
            >
                <span
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: '#3fb950',
                        animation: 'scPulse 1.4s ease-in-out infinite',
                    }}
                />
                Canary <span style={{ color: '#5a636e', fontSize: 11 }}>(live)</span>
            </button>
            <button onClick={() => setMode('load')} style={style(mode === 'load')}>
                Load test <span style={{ color: '#5a636e', fontSize: 11 }}>(on-demand)</span>
            </button>
        </div>
    );
}
