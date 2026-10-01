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
 *
 * Videos widened the same two messages instead of adding new ones, so the handshake cannot tell an
 * app that takes videos from one built before them. That one is learned instead: an older app answers
 * a video with `UNSUPPORTED_TYPE`, and `withdrawVideoExport` hides video export from then on while
 * photos keep theirs.
 */
class ShellCapabilities {
    private report: OnWebAppReadyPayload | null = null;
    private imageExportWithdrawn = false;
    private videoExportWithdrawn = false;
    private readonly listeners = new Set<Listener>();

    setReport(report: OnWebAppReadyPayload | null): void {
        this.report = report;
        this.notify();
    }

    canExportImages(): boolean {
        return !this.imageExportWithdrawn && supportsImageExport(this.report);
    }

    /** Photo export, and no video yet refused as a format this app does not know. */
    canExportVideos(): boolean {
        return !this.videoExportWithdrawn && this.canExportImages();
    }

    /** An app built before videos refused one: hide video export until the page reloads. */
    withdrawVideoExport(): void {
        if (this.videoExportWithdrawn) return;
        this.videoExportWithdrawn = true;
        this.notify();
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
        this.videoExportWithdrawn = false;
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

/** Re-renders when video export becomes possible or is withdrawn. */
export const useCanExportVideos = (): boolean =>
    useSyncExternalStore(shellCapabilities.subscribe, () => shellCapabilities.canExportVideos());
