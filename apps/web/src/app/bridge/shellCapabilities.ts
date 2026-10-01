import { useSyncExternalStore } from 'react';

import type { OnWebAppReadyPayload } from '@chatic/app-messages';

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
 * Image export is decided from the handshake rather than learned from a first `NOT_FOUND`, because
 * the buttons have to be absent before anyone presses them — on an older app they would otherwise
 * appear and fail. Until the report arrives the answer is `false`, so the viewer, which opens long
 * after boot, never shows a button that is not backed. The report is built from the app's compiled
 * message map rather than from its handlers; that gap is closed on the app side, where a test holds
 * both types to a registered handler. If a press still meets `NOT_FOUND`, `withdrawImageExport`
 * turns the buttons off for the rest of the session.
 */
class ShellCapabilities {
    private report: OnWebAppReadyPayload | null = null;
    private imageExportWithdrawn = false;
    private readonly listeners = new Set<Listener>();

    setReport(report: OnWebAppReadyPayload | null): void {
        this.report = report;
        this.notify();
    }

    canExportImages(): boolean {
        return !this.imageExportWithdrawn && supportsImageExport(this.report);
    }

    /** The shell answered `NOT_FOUND` after all: hide the buttons until the page reloads. */
    withdrawImageExport(): void {
        if (this.imageExportWithdrawn) return;
        this.imageExportWithdrawn = true;
        this.notify();
    }

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    /** Test seam — forgets the report and any withdrawal. */
    reset(): void {
        this.report = null;
        this.imageExportWithdrawn = false;
        this.notify();
    }

    private notify(): void {
        for (const listener of this.listeners) listener();
    }
}

export const shellCapabilities = new ShellCapabilities();

/** Re-renders when the handshake arrives or export is withdrawn. */
export const useCanExportImages = (): boolean =>
    useSyncExternalStore(shellCapabilities.subscribe, () => shellCapabilities.canExportImages());
