import { useMemo } from 'react';

import { usePointerStore } from '../stores';

import type { RemotePointer } from '../types';
import type { JSX } from 'react';

interface RemotePointerCanvasProps {
    width?: number;
    height?: number;
}

// Generate consistent color from deviceId
const getPointerColor = (deviceId: string): string => {
    const colors = [
        'rgb(59, 130, 246)', // blue
        'rgb(16, 185, 129)', // green
        'rgb(245, 158, 11)', // amber
        'rgb(239, 68, 68)', // red
        'rgb(168, 85, 247)', // purple
        'rgb(236, 72, 153)', // pink
        'rgb(20, 184, 166)', // teal
    ];
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
        hash = deviceId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

/**
 * Canvas component that displays remote pointer positions
 * Shows cursors from all connected devices
 */
export const RemotePointerCanvas = ({ width = 600, height = 400 }: RemotePointerCanvasProps): JSX.Element => {
    const pointers = usePointerStore(state => state.pointers);

    const pointerList = useMemo(() => Array.from(pointers.values()), [pointers]);

    return (
        <div className="relative">
            <div
                className="relative border-2 border-dashed border-border rounded-lg bg-muted/20 overflow-hidden"
                style={{ width, height }}
            >
                {/* Grid pattern */}
                <div
                    className="absolute inset-0 opacity-10"
                    style={{
                        backgroundImage: `
                            linear-gradient(to right, currentColor 1px, transparent 1px),
                            linear-gradient(to bottom, currentColor 1px, transparent 1px)
                        `,
                        backgroundSize: '50px 50px',
                    }}
                />

                {/* Center crosshair */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-px h-full bg-border/30" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-full h-px bg-border/30" />
                </div>

                {/* Remote cursors */}
                {pointerList.map((pointer: RemotePointer) => {
                    const color = getPointerColor(pointer.deviceId);
                    return (
                        <div
                            key={pointer.deviceId}
                            className="absolute pointer-events-none transition-all duration-75 ease-out"
                            style={{
                                left: pointer.posX,
                                top: pointer.posY,
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            {/* Cursor dot */}
                            <div
                                className="w-4 h-4 rounded-full border-2 shadow-lg"
                                style={{
                                    backgroundColor: `${color}80`,
                                    borderColor: color,
                                }}
                            />
                            {/* Device ID label */}
                            <div
                                className="absolute top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap shadow-md"
                                style={{
                                    backgroundColor: color,
                                    color: 'white',
                                }}
                            >
                                {pointer.deviceId.slice(0, 8)}
                            </div>
                        </div>
                    );
                })}

                {/* Canvas label */}
                <div className="absolute top-2 left-2 px-2 py-1 rounded bg-background/80 text-xs font-medium">
                    Remote Pointers ({width} × {height})
                </div>

                {/* Connection count */}
                <div className="absolute top-2 right-2 px-2 py-1 rounded bg-background/80 text-xs font-mono">
                    {pointerList.length} device{pointerList.length !== 1 ? 's' : ''}
                </div>

                {/* No pointers message */}
                {pointerList.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                            <p className="text-sm">No remote pointers</p>
                            <p className="text-xs mt-1">Waiting for Web App connections...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Pointer list */}
            {pointerList.length > 0 && (
                <div className="mt-4 space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground">Active Pointers</h4>
                    <div className="grid gap-2">
                        {pointerList.map((pointer: RemotePointer) => {
                            const color = getPointerColor(pointer.deviceId);
                            const age = Date.now() - pointer.lastUpdated;
                            const isStale = age > 5000;

                            return (
                                <div
                                    key={pointer.deviceId}
                                    className={`flex items-center justify-between p-2 rounded-md border ${
                                        isStale ? 'opacity-50' : ''
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                        <span className="text-xs font-mono">{pointer.deviceId.slice(0, 12)}...</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono">
                                        ({pointer.posX}, {pointer.posY})
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
