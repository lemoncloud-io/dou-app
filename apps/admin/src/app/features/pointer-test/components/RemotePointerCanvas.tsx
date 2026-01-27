import { useMemo } from 'react';

import { usePointerStore } from '../stores';

import type { RemotePointer } from '../types';
import type { JSX } from 'react';

/** Threshold in ms after which a pointer is considered stale */
const STALE_THRESHOLD_MS = 5000;

interface RemotePointerCanvasProps {
    width?: number;
    height?: number;
}

/**
 * Generate consistent HSL color from deviceId
 * Uses full hue spectrum (0-360) for better color distribution
 * Returns [solidColor, transparentColor] for border and background
 */
const getPointerColors = (deviceId: string): { solid: string; transparent: string } => {
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
        hash = deviceId.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash ^ (deviceId.charCodeAt(i) << i % 16);
    }
    const hue = Math.abs(hash) % 360;
    return {
        solid: `hsl(${hue}, 70%, 50%)`,
        transparent: `hsl(${hue}, 70%, 50%, 0.5)`,
    };
};

/**
 * Canvas component that displays remote pointer positions
 * Shows cursors from all connected devices
 * Optimized for dashboard display
 */
export const RemotePointerCanvas = ({ width = 800, height = 500 }: RemotePointerCanvasProps): JSX.Element => {
    const pointers = usePointerStore(state => state.pointers);

    const pointerList = useMemo(() => Array.from(pointers.values()), [pointers]);

    return (
        <div
            className="relative rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 overflow-hidden shadow-inner"
            style={{ width, height }}
        >
            {/* Dot grid pattern */}
            <div
                className="absolute inset-0 opacity-20"
                style={{
                    backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                }}
            />

            {/* Axis lines */}
            <div className="absolute inset-0">
                {/* Vertical center line */}
                <div
                    className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-500/30 to-transparent"
                    style={{ left: '50%' }}
                />
                {/* Horizontal center line */}
                <div
                    className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-500/30 to-transparent"
                    style={{ top: '50%' }}
                />
            </div>

            {/* Quadrant labels */}
            <div className="absolute top-3 left-3 text-[10px] font-mono text-slate-500">0,0</div>
            <div className="absolute top-3 right-3 text-[10px] font-mono text-slate-500">{width},0</div>
            <div className="absolute bottom-3 left-3 text-[10px] font-mono text-slate-500">0,{height}</div>
            <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-500">
                {width},{height}
            </div>

            {/* Remote cursors */}
            {pointerList.map((pointer: RemotePointer) => {
                const colors = getPointerColors(pointer.deviceId);
                const age = Date.now() - pointer.lastUpdated;
                const isStale = age > STALE_THRESHOLD_MS;

                return (
                    <div
                        key={pointer.deviceId}
                        className={`absolute pointer-events-none transition-all duration-100 ease-out ${isStale ? 'opacity-40' : ''}`}
                        style={{
                            left: pointer.posX,
                            top: pointer.posY,
                            transform: 'translate(-50%, -50%)',
                        }}
                    >
                        {/* Cursor outer ring */}
                        <div
                            className="absolute w-8 h-8 rounded-full -translate-x-1/2 -translate-y-1/2 animate-ping"
                            style={{
                                backgroundColor: colors.transparent,
                                opacity: 0.3,
                                animationDuration: '2s',
                            }}
                        />
                        {/* Cursor dot */}
                        <div
                            className="w-5 h-5 rounded-full border-2 shadow-lg shadow-black/30"
                            style={{
                                backgroundColor: colors.transparent,
                                borderColor: colors.solid,
                            }}
                        />
                        {/* Device ID label */}
                        <div
                            className="absolute top-6 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md text-[11px] font-mono whitespace-nowrap shadow-lg"
                            style={{
                                backgroundColor: colors.solid,
                                color: 'white',
                            }}
                        >
                            {pointer.deviceId.slice(0, 8)}
                        </div>
                        {/* Status indicator */}
                        <div
                            className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white/50 ${
                                pointer.status === 'green'
                                    ? 'bg-green-500'
                                    : pointer.status === 'yellow'
                                      ? 'bg-yellow-500'
                                      : pointer.status === 'red'
                                        ? 'bg-red-500'
                                        : 'bg-gray-400'
                            }`}
                        />
                    </div>
                );
            })}

            {/* No pointers message */}
            {pointerList.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700/50 flex items-center justify-center">
                            <span className="text-3xl">👆</span>
                        </div>
                        <p className="text-sm text-slate-400 font-medium">Waiting for connections</p>
                        <p className="text-xs text-slate-500 mt-1">
                            Remote pointers will appear here when Web App users move their mouse
                        </p>
                    </div>
                </div>
            )}

            {/* Canvas info overlay */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm text-xs font-medium text-slate-300">
                Remote Canvas ({width} × {height})
            </div>
        </div>
    );
};
