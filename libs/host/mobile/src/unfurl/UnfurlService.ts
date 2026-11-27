import type { Logger } from '@chatic/logger';
import type { IUnfurlService, UrlMetadataResult } from './types';

const UNFURL_TIMEOUT_MS = 3000;
const UNFURL_MAX_BYTES = 256 * 1024;

export interface ParsedUrl {
    protocol: string;
    hostname: string;
    origin: string;
    path: string;
}

export const parseUrl = (raw: string): ParsedUrl | null => {
    const match = raw.trim().match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/i);
    if (!match) return null;

    const authority = match[2];
    if (!authority) return null;

    const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
    const hostname = hostPort.startsWith('[') ? hostPort.slice(0, hostPort.indexOf(']') + 1) : hostPort.split(':')[0];
    if (!hostname) return null;

    const protocol = `${match[1].toLowerCase()}:`;
    return {
        protocol,
        hostname: hostname.toLowerCase(),
        origin: `${protocol}//${hostPort}`,
        path: match[3] || '/',
    };
};

export const isPrivateHost = (hostname: string): boolean => {
    const host = hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, '')
        .replace(/\.$/, '');
    if (!host) return true;

    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host.endsWith('.local') || host.endsWith('.internal')) return true;

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const a = Number(ipv4[1]);
        const b = Number(ipv4[2]);
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        return false;
    }

    if (host.includes(':')) {
        return host === '::1' || host === '::' || /^f[cd]/.test(host) || host.startsWith('fe8');
    }

    return !/^([^.\s]+\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/.test(host);
};

const decodeEntities = (value: string): string =>
    value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x0*27;/gi, "'")
        .replace(/&amp;/g, '&');

const metaContent = (html: string, key: string): string | undefined => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const forward = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i');
    const backward = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i');
    const raw = html.match(forward)?.[1] ?? html.match(backward)?.[1];
    const decoded = raw ? decodeEntities(raw).trim() : '';
    return decoded || undefined;
};

const resolveImageUrl = (raw: string, landed: ParsedUrl): string | undefined => {
    const value = raw.trim();
    if (!value) return undefined;

    let absolute: string;
    if (/^https?:\/\//i.test(value)) absolute = value;
    else if (value.startsWith('//')) absolute = `${landed.protocol}${value}`;
    else if (value.startsWith('/')) absolute = `${landed.origin}${value}`;
    else absolute = `${landed.origin}${landed.path.replace(/[^/]*$/, '')}${value}`;

    return /^https:\/\//i.test(absolute) ? absolute : undefined;
};

export const parseOgMetadata = (html: string, requestUrl: string, landedUrl: string): UrlMetadataResult => {
    const landed = parseUrl(landedUrl) ?? parseUrl(requestUrl);
    const title =
        metaContent(html, 'og:title') ??
        (decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
            .replace(/\s+/g, ' ')
            .trim() ||
            undefined);

    if (!title || !landed) return { success: false, url: requestUrl };

    const image = metaContent(html, 'og:image') ?? metaContent(html, 'og:image:url');
    return {
        success: true,
        url: requestUrl,
        title,
        description: metaContent(html, 'og:description') ?? metaContent(html, 'description'),
        imageUrl: image ? resolveImageUrl(image, landed) : undefined,
        siteName: metaContent(html, 'og:site_name'),
    };
};

export interface FetchedPage {
    html: string;
    landedUrl: string;
}

export const fetchHtml = (url: string): Promise<FetchedPage | null> =>
    new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        let snapshot = '';
        let settled = false;

        const abort = () => {
            try {
                xhr.abort();
            } catch {
                // Already finished; nothing to cancel.
            }
        };

        const finish = (result: FetchedPage | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };

        const timer = setTimeout(() => {
            finish(null);
            abort();
        }, UNFURL_TIMEOUT_MS + 500);

        xhr.addEventListener('readystatechange', () => {
            if (xhr.readyState !== 2) return;

            const landedUrl = xhr.responseURL || url;
            const landed = parseUrl(landedUrl);
            if (!landed || isPrivateHost(landed.hostname)) {
                finish(null);
                abort();
                return;
            }

            const contentType = xhr.getResponseHeader('content-type') ?? '';
            if (xhr.status < 200 || xhr.status >= 300 || !contentType.includes('html')) {
                finish(null);
                abort();
            }
        });

        xhr.addEventListener('progress', event => {
            snapshot = xhr.responseText || snapshot;
            if (event.loaded >= UNFURL_MAX_BYTES) {
                finish({ html: snapshot, landedUrl: xhr.responseURL || url });
                abort();
            }
        });

        xhr.onload = () => finish({ html: xhr.responseText || snapshot, landedUrl: xhr.responseURL || url });
        xhr.onerror = () => finish(null);
        xhr.ontimeout = () => finish(null);
        xhr.onabort = () => finish(null);

        try {
            xhr.open('GET', url);
            xhr.timeout = UNFURL_TIMEOUT_MS;
            xhr.setRequestHeader('accept', 'text/html,application/xhtml+xml');
            xhr.send();
        } catch {
            finish(null);
        }
    });

export class UnfurlService implements IUnfurlService {
    constructor(private readonly logger: Logger) {}

    async fetchUrlMetadata(url: string): Promise<UrlMetadataResult> {
        const fail: UrlMetadataResult = { success: false, url };

        const target = parseUrl(url);
        if (!target) return fail;
        if (target.protocol !== 'https:' && target.protocol !== 'http:') return fail;
        if (isPrivateHost(target.hostname)) {
            this.logger.debug('UNFURL', 'Refused to unfurl a non-public host', { hostname: target.hostname });
            return fail;
        }

        const page = await fetchHtml(url);
        if (!page) return fail;

        return parseOgMetadata(page.html, url, page.landedUrl);
    }
}
