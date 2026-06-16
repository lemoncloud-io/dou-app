/**
 * URL unfurl for chat link previews. Runs in the main process because the
 * renderer cannot read cross-origin pages (CORS).
 *
 * Security: any user can make any message containing any URL, and this code
 * fetches it automatically — so it must not become an internal-network probe
 * (SSRF). Guards: http(s) only, private/loopback/link-local hosts rejected
 * (checked again after redirects), 3s timeout, 256KB read cap, and only an
 * https image URL is forwarded (never image bytes).
 */

export interface UrlMetadataResult {
    success: boolean;
    url: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
}

const UNFURL_TIMEOUT_MS = 3000;
const UNFURL_MAX_BYTES = 256 * 1024;

const isPrivateHost = (hostname: string): boolean => {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        return false;
    }
    if (host.includes(':')) {
        // IPv6 literal: loopback, unique-local (fc00::/7), link-local (fe80::/10).
        return (
            host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8')
        );
    }
    return false;
};

const decodeEntities = (value: string): string =>
    value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'");

/** Extract <meta property|name="<key>" content="..."> regardless of attribute order. */
const metaContent = (html: string, key: string): string | undefined => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const forward = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i');
    const backward = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i');
    const raw = html.match(forward)?.[1] ?? html.match(backward)?.[1];
    const decoded = raw ? decodeEntities(raw).trim() : '';
    return decoded || undefined;
};

const readBody = async (response: Response): Promise<string> => {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let html = '';
    let bytes = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (bytes >= UNFURL_MAX_BYTES) {
            void reader.cancel().catch(() => undefined);
            break;
        }
    }
    return html;
};

export const fetchUrlMetadata = async (rawUrl: string): Promise<UrlMetadataResult> => {
    const fail: UrlMetadataResult = { success: false, url: rawUrl };
    let target: URL;
    try {
        target = new URL(rawUrl);
    } catch {
        return fail;
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return fail;
    if (isPrivateHost(target.hostname)) return fail;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UNFURL_TIMEOUT_MS);
    try {
        const response = await fetch(target.toString(), {
            signal: controller.signal,
            redirect: 'follow',
            headers: { accept: 'text/html,application/xhtml+xml' },
        });
        // A redirect chain may land on an internal host — re-check the final URL.
        const landed = new URL(response.url || target.toString());
        if (isPrivateHost(landed.hostname)) return fail;
        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok || !contentType.includes('html')) return fail;

        const html = await readBody(response);
        const title =
            metaContent(html, 'og:title') ??
            (decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim() || undefined);
        if (!title) return fail;
        const imageUrl = metaContent(html, 'og:image');
        return {
            success: true,
            url: rawUrl,
            title,
            description: metaContent(html, 'og:description') ?? metaContent(html, 'description'),
            imageUrl: imageUrl && /^https:\/\//i.test(imageUrl) ? imageUrl : undefined,
            siteName: metaContent(html, 'og:site_name'),
        };
    } catch {
        return fail;
    } finally {
        clearTimeout(timer);
    }
};
