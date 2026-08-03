import type { ILogService } from '../log';
import type { IUnfurlService, UrlMetadataResult } from './types';

const UNFURL_TIMEOUT_MS = 3000;
const UNFURL_MAX_BYTES = 256 * 1024;

/** Parsed pieces of an absolute http(s) URL. */
export interface ParsedUrl {
    /** Lowercased, with the trailing colon (`https:`). */
    protocol: string;
    /** Lowercased host without port or userinfo. IPv6 literals keep their brackets. */
    hostname: string;
    origin: string;
    /** Path only, without query or fragment. */
    path: string;
}

/**
 * Minimal absolute-URL splitter.
 *
 * React Native's `URL` global is a stub exposing only `href`/`toString()` — it has no `protocol`
 * or `hostname` — so the guards below cannot depend on it. Returns null for anything that isn't a
 * scheme-qualified absolute URL.
 */
export const parseUrl = (raw: string): ParsedUrl | null => {
    const match = raw.trim().match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/i);
    if (!match) return null;

    const authority = match[2];
    if (!authority) return null;

    // `http://trusted.example@127.0.0.1/` reads as trusted.example to a human but resolves to
    // 127.0.0.1 — the real host is whatever follows the LAST `@`.
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

/**
 * Blocks hosts that must never be fetched on a user's behalf.
 *
 * Any channel member can post any URL and the shell fetches it automatically, so without this the
 * app is an intranet probe (SSRF). The default is deny: anything that doesn't look like a public
 * DNS name or a public IPv4 literal is rejected, which also closes the alternate IP encodings
 * (`http://2130706433/`, `http://0x7f000001/`) that a "not a dotted quad, so allow it" check lets
 * through.
 *
 * String-level only. A public DNS name that resolves to a private address still gets through — the
 * shell can't see resolution results. Closing that needs a server-side unfurl; see
 * docs/chat-link-preview.md.
 */
export const isPrivateHost = (hostname: string): boolean => {
    // Strip IPv6 brackets and a trailing FQDN dot.
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
        if (a === 169 && b === 254) return true; // link-local
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        return false;
    }

    if (host.includes(':')) {
        // IPv6 literal: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10).
        return host === '::1' || host === '::' || /^f[cd]/.test(host) || host.startsWith('fe8');
    }

    // Must look like a public DNS name: at least one dot, and a TLD that is alphabetic or punycode.
    // Rejects single-label intranet hosts (`http://wiki/`) and every non-dotted-quad IP encoding.
    return !/^([^.\s]+\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/.test(host);
};

/** `&amp;` is decoded last so `&amp;lt;` yields the literal `&lt;` rather than `<`. */
const decodeEntities = (value: string): string =>
    value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x0*27;/gi, "'")
        .replace(/&amp;/g, '&');

/** Reads `<meta property|name="<key>" content="...">` regardless of attribute order. */
const metaContent = (html: string, key: string): string | undefined => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const forward = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i');
    const backward = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i');
    const raw = html.match(forward)?.[1] ?? html.match(backward)?.[1];
    const decoded = raw ? decodeEntities(raw).trim() : '';
    return decoded || undefined;
};

/**
 * Resolves a possibly-relative `og:image` against the page it came from, then keeps it only if it
 * ended up https — the webview blocks http images as mixed content, so an http URL is dead weight
 * on the bridge.
 */
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

/**
 * Extracts the preview fields from a page's HTML.
 *
 * `requestUrl` — not the redirect landing URL — is echoed back: it is the web side's cache key,
 * and a mismatch would make every redirecting link miss the cache forever.
 */
export const parseOgMetadata = (html: string, requestUrl: string, landedUrl: string): UrlMetadataResult => {
    const landed = parseUrl(landedUrl) ?? parseUrl(requestUrl);
    const title =
        metaContent(html, 'og:title') ??
        (decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
            .replace(/\s+/g, ' ')
            .trim() ||
            undefined);

    // A card with no title isn't a card.
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

/**
 * GETs a page and returns at most UNFURL_MAX_BYTES of its HTML, or null if any guard rejects it.
 *
 * Uses XMLHttpRequest rather than fetch/axios on purpose. RN 0.83's `fetch` is XHR-backed and has
 * no `response.body`, so a streaming-reader byte cap always reads an empty body; and aborting an
 * axios request discards the bytes already received, so a page larger than the cap yields nothing
 * even though its og tags sit in the first few KB. Raw XHR gives all three guards their natural
 * home: header-time checks before any body arrives, a byte cap that keeps what it already read,
 * and a native timeout.
 *
 * Attaching progress/readystatechange listeners is also what makes RN stream text incrementally
 * into `responseText`. If that ever stops holding, the cap branch snapshots an empty string and
 * oversized pages simply fail — pages under the cap are unaffected.
 */
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

        // `abort()` synchronously dispatches an `abort` event, so every caller below must settle
        // BEFORE aborting — otherwise the abort handler's `null` wins the race.
        const finish = (result: FetchedPage | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };

        // `xhr.timeout` is honoured by RN's native networking; this is the backstop for a stalled
        // native layer that would otherwise leave the promise pending forever.
        const timer = setTimeout(() => {
            finish(null);
            abort();
        }, UNFURL_TIMEOUT_MS + 500);

        xhr.addEventListener('readystatechange', () => {
            if (xhr.readyState !== 2) return; // HEADERS_RECEIVED

            // A redirect chain may land on an internal host. Re-check before reading any body:
            // intermediate hops can't be inspected, but the destination must not be internal.
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
            // Snapshot first: abort() clears the internal response buffer.
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

/**
 * Fetches and parses og: metadata on the webview's behalf — it can't read cross-origin pages.
 *
 * Stateless: results are cached on the web side (per session, in memory), not here.
 */
export class UnfurlService implements IUnfurlService {
    constructor(private readonly logger: ILogService) {}

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
