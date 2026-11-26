import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app, type BrowserWindow, screen } from 'electron';

export const BOUNDS_MIN_WIDTH = 720;
export const BOUNDS_MIN_HEIGHT = 480;

const windowBoundsFile = (): string => join(app.getPath('userData'), 'chatic-window-bounds.json');

export const loadWindowBounds = (): { x?: number; y?: number; width: number; height: number } | null => {
    try {
        const b = JSON.parse(readFileSync(windowBoundsFile(), 'utf8')) as {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
        };
        if (typeof b.width === 'number' && typeof b.height === 'number') {
            const onScreen =
                typeof b.x === 'number' &&
                typeof b.y === 'number' &&
                screen.getAllDisplays().some(({ workArea }) => {
                    return (
                        b.x! >= workArea.x &&
                        b.y! >= workArea.y &&
                        b.x! < workArea.x + workArea.width &&
                        b.y! < workArea.y + workArea.height
                    );
                });
            return {
                x: onScreen ? b.x : undefined,
                y: onScreen ? b.y : undefined,
                width: Math.max(BOUNDS_MIN_WIDTH, b.width),
                height: Math.max(BOUNDS_MIN_HEIGHT, b.height),
            };
        }
    } catch {
        return null;
    }
    return null;
};

export const saveWindowBounds = (win: BrowserWindow): void => {
    try {
        if (win.isMinimized() || win.isMaximized()) return;
        writeFileSync(windowBoundsFile(), JSON.stringify(win.getBounds()), 'utf8');
    } catch {
        return;
    }
};
