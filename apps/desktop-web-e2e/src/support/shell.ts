import type { BrowserContext, Page } from '@playwright/test';

export interface Banner {
    title: string;
    body: string;
    channelId?: string;
    deeplink?: string;
}

declare global {
    interface Window {
        __e2eBanners?: Banner[];
        ChaticMessageHandler?: { postMessage?: (message: string) => void };
    }
}

export const installShell = (context: BrowserContext, session: string) =>
    context.addInitScript(saved => {
        try {
            for (const [key, value] of Object.entries(JSON.parse(saved) as Record<string, string>)) {
                if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
            }
        } catch {
            // A sandboxed frame (a file preview) has no storage of its own.
        }
        window.__e2eBanners = [];
        const answer = (message: object) =>
            setTimeout(() => window.postMessage(JSON.stringify(message), window.location.origin), 0);
        window.ChaticMessageHandler = {
            postMessage: (encoded: string) => {
                const request = JSON.parse(encoded) as {
                    type: string;
                    refId?: string;
                    version?: string;
                    data?: unknown;
                };
                if (request.type === 'ShowNotification') {
                    window.__e2eBanners?.push(request.data as Banner);
                    if (request.refId) {
                        answer({
                            type: 'OnShowNotification',
                            refId: request.refId,
                            version: request.version,
                            success: true,
                            data: {},
                        });
                    }
                    return;
                }
                if (!request.refId) return;
                answer({
                    type: 'ERROR',
                    refId: request.refId,
                    version: request.version,
                    success: false,
                    error: { code: 'NOT_FOUND', message: `No handler registered for message type: ${request.type}` },
                });
            },
        };
    }, session);

export const banners = (page: Page): Promise<Banner[]> => page.evaluate(() => window.__e2eBanners ?? []);
