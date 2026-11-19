import { runtime } from '@chatic/runtime';
import { useEffect } from 'react';

/**
 * Render a small unread-count badge to a PNG data URL. Windows has no dock badge,
 * so the shell paints this as a taskbar overlay icon — and Electron's nativeImage
 * can't rasterize SVG, so the renderer (which has a canvas) produces the PNG.
 * Returns undefined when count is 0 or canvas is unavailable.
 */
const renderBadgePng = (count: number): string | undefined => {
    if (count <= 0 || typeof document === 'undefined') return undefined;
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const label = count > 9 ? '9+' : String(count);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${count > 9 ? 8 : 10}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, size / 2, size / 2 + 0.5);
    return canvas.toDataURL('image/png');
};

/**
 * Mirror the unread total onto the OS dock/taskbar badge the desktop shell paints.
 * No-op unless the frame has a dock badge (the host's `appShell` port; not in a
 * plain browser) and on shells that don't support it (the request is best-effort).
 */
export const useDesktopBadge = (count: number): void => {
    useEffect(() => {
        const dockBadge = runtime.appShell.dockBadge;
        if (!dockBadge) return;
        void dockBadge.set(count, renderBadgePng(count)).catch(() => undefined);
    }, [count]);
};
