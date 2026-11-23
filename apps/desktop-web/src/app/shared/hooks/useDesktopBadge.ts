import { runtime } from '@chatic/runtime';
import { useEffect } from 'react';

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

export const useDesktopBadge = (count: number): void => {
    useEffect(() => {
        const dockBadge = runtime.appShell.dockBadge;
        if (!dockBadge) return;
        void dockBadge.set(count, renderBadgePng(count)).catch(() => undefined);
    }, [count]);
};
