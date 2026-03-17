import { useCallback, useRef, useState } from 'react';

import type { JSX, MouseEvent } from 'react';

interface PointerCanvasProps {
    onPointerMove: (posX: number, posY: number) => void;
    width?: number;
    height?: number;
}

interface PointerPosition {
    x: number;
    y: number;
}

/**
 * Canvas component that tracks mouse pointer position
 * Displays local cursor position and sends coordinates via callback
 */
export const PointerCanvas = ({ onPointerMove, width = 600, height = 400 }: PointerCanvasProps): JSX.Element => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [localPosition, setLocalPosition] = useState<PointerPosition | null>(null);

    const handleMouseMove = useCallback(
        (e: MouseEvent<HTMLDivElement>) => {
            if (!canvasRef.current) return;

            const rect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            setLocalPosition({ x, y });
            onPointerMove(x, y);
        },
        [onPointerMove]
    );

    const handleMouseLeave = useCallback(() => {
        setLocalPosition(null);
    }, []);

    return (
        <div className="relative">
            <div
                ref={canvasRef}
                className="relative border-2 border-dashed border-border rounded-lg bg-muted/20 cursor-crosshair overflow-hidden"
                style={{ width, height }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
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

                {/* Local cursor indicator */}
                {localPosition && (
                    <div
                        className="absolute pointer-events-none"
                        style={{
                            left: localPosition.x,
                            top: localPosition.y,
                            transform: 'translate(-50%, -50%)',
                        }}
                    >
                        <div className="w-4 h-4 rounded-full bg-blue-500/50 border-2 border-blue-500 animate-pulse" />
                    </div>
                )}

                {/* Canvas label */}
                <div className="absolute top-2 left-2 px-2 py-1 rounded bg-background/80 text-xs font-medium">
                    Pointer Area ({width} × {height})
                </div>

                {/* Coordinate display */}
                {localPosition && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-background/80 text-xs font-mono">
                        X: {Math.round(localPosition.x)} Y: {Math.round(localPosition.y)}
                    </div>
                )}
            </div>
        </div>
    );
};
