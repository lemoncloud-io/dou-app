import { useSyncExternalStore } from 'react';

import type { OnWebAppReadyPayload, WebMessageType } from '@chatic/bridge-messages';

/**
 * Whether the installed app can save and share a chat image: its handshake lists both messages.
 *
 * Both are required because the viewer offers both, and a button that answers `NOT_FOUND` is worse
 * than no button. A `null` report — a plain browser tab, or no report yet — is `false`.
 */
export const supportsImageExport = (report: OnWebAppReadyPayload | null): boolean => {
    const supported = report?.supportedWebMessages ?? [];
    return supported.includes('SaveToPhotoLibrary') && supported.includes('ShareFile');
};

type Listener = () => void;

/**
 * What the installed shell said it can do, held for the page's life.
 *
 * Image export is decided from the handshake, because the buttons have to be absent before anyone
 * presses them. Until the report arrives the answer is `false`, so the viewer, which opens long after
 * boot, never shows a button that is not backed. A plain browser tab never gets a report. Every phone
 * app this page runs in lists both messages, and they take videos as well as photos.
 */
class ShellCapabilities {
    private report: OnWebAppReadyPayload | null = null;
    private readonly listeners = new Set<Listener>();

    setReport(report: OnWebAppReadyPayload | null): void {
        this.report = report;
        this.notify();
    }

    /** Whether the handshake listed `type`. `false` before it arrives, and in a browser tab. */
    supports(type: WebMessageType): boolean {
        return this.report?.supportedWebMessages?.includes(type) ?? false;
    }

    canExportImages(): boolean {
        return supportsImageExport(this.report);
    }

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    /** Test seam — forgets the report. */
    reset(): void {
        this.report = null;
        this.notify();
    }

    private notify(): void {
        for (const listener of this.listeners) listener();
    }
}

export const shellCapabilities = new ShellCapabilities();

/** Re-renders when the handshake arrives. */
export const useCanExportImages = (): boolean =>
    useSyncExternalStore(shellCapabilities.subscribe, () => shellCapabilities.canExportImages());
