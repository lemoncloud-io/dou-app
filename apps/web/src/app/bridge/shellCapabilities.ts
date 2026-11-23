import { useSyncExternalStore } from 'react';

import type { OnWebAppReadyPayload, SubWebViewOpenScope, WebMessageType } from '@chatic/bridge-messages';

export const supportsImageExport = (report: OnWebAppReadyPayload | null): boolean => {
    const supported = report?.supportedWebMessages ?? [];
    return supported.includes('SaveToPhotoLibrary') && supported.includes('ShareFile');
};

type Listener = () => void;

class ShellCapabilities {
    private report: OnWebAppReadyPayload | null = null;
    private readonly listeners = new Set<Listener>();

    setReport(report: OnWebAppReadyPayload | null): void {
        this.report = report;
        this.notify();
    }

    supports(type: WebMessageType): boolean {
        return this.report?.supportedWebMessages?.includes(type) ?? false;
    }

    canExportImages(): boolean {
        return supportsImageExport(this.report);
    }

    subWebViewOpenScope(): SubWebViewOpenScope | null {
        return this.report?.subWebViewOpenScope ?? null;
    }

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    reset(): void {
        this.report = null;
        this.notify();
    }

    private notify(): void {
        for (const listener of this.listeners) listener();
    }
}

export const shellCapabilities = new ShellCapabilities();

export const useCanExportImages = (): boolean =>
    useSyncExternalStore(shellCapabilities.subscribe, () => shellCapabilities.canExportImages());

export const useSubWebViewOpenScope = (): SubWebViewOpenScope | null =>
    useSyncExternalStore(shellCapabilities.subscribe, () => shellCapabilities.subWebViewOpenScope());
