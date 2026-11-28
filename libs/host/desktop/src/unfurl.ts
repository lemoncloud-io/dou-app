import { BlockList, isIP } from 'node:net';

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
const UNFURL_MAX_REDIRECTS = 5;

const isPrivateIpv4 = (a: number, b: number): boolean =>
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);

const PRIVATE_IPV6 = new BlockList();
PRIVATE_IPV6.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_IPV6.addSubnet('fe80::', 10, 'ipv6');
PRIVATE_IPV6.addSubnet('::', 96, 'ipv6');

const IPV4_MAPPED = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal'];

export const isPrivateHost = (hostname: string): boolean => {
    const host = hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, '')
        .replace(/\.+$/, '');
    if (PRIVATE_SUFFIXES.some(suffix => host.endsWith(suffix)) || host === 'localhost') return true;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) return isPrivateIpv4(Number(ipv4[1]), Number(ipv4[2]));
    if (isIP(host) === 6) {
        const mapped = host.match(IPV4_MAPPED);
        if (mapped) {
            const high = parseInt(mapped[1], 16);
            return isPrivateIpv4(high >> 8, high & 0xff);
        }
        return PRIVATE_IPV6.check(host, 'ipv6');
    }
    return !host.includes('.');
};

const decodeEntities = (value: string): string =>
    value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'");

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

const isFetchable = (url: URL): boolean =>
    (url.protocol === 'https:' || url.protocol === 'http:') && !isPrivateHost(url.hostname);

const fetchChecked = async (start: URL, signal: AbortSignal): Promise<Response | null> => {
    let current = start;
    for (let hop = 0; hop <= UNFURL_MAX_REDIRECTS; hop++) {
        if (!isFetchable(current)) return null;
        const response = await fetch(current.toString(), {
            signal,
            redirect: 'manual',
            headers: { accept: 'text/html,application/xhtml+xml' },
        });
        if (response.status < 300 || response.status >= 400) return response;
        void response.body?.cancel().catch(() => undefined);
        const location = response.headers.get('location');
        if (!location) return null;
        try {
            current = new URL(location, current);
        } catch {
            return null;
        }
    }
    return null;
};

export const fetchUrlMetadata = async (rawUrl: string): Promise<UrlMetadataResult> => {
    const fail: UrlMetadataResult = { success: false, url: rawUrl };
    let target: URL;
    try {
        target = new URL(rawUrl);
    } catch {
        return fail;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UNFURL_TIMEOUT_MS);
    try {
        const response = await fetchChecked(target, controller.signal);
        if (!response) return fail;
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
