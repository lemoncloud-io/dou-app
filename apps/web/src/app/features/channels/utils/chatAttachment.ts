import type { ChatAttachment } from '@lemoncloud/chatic-socials-api';

/**
 * The attachment's source link, or `undefined` when it must not be offered.
 *
 * Only `http`/`https` survive. The attachment body is webhook input the server stores verbatim, so
 * a `javascript:` or `data:` value would otherwise reach an anchor's `href` — and this link is
 * handed to `openExternalUrl`, which passes it straight to the OS browser in the native shell.
 */
export const safeAttachmentUrl = (sourceUrl?: string): string | undefined => {
    const raw = sourceUrl?.trim();
    if (!raw) return undefined;
    try {
        const { protocol } = new URL(raw);
        return protocol === 'http:' || protocol === 'https:' ? raw : undefined;
    } catch {
        // Not absolute, so there is no origin to send anyone to.
        return undefined;
    }
};

/**
 * Whether an attachment has anything worth drawing.
 *
 * The server preserves whatever the sender put in `meta` without interpreting it, so an attachment
 * can arrive technically present but empty (`{}`) — rendering a bare card for that is worse than
 * rendering nothing.
 */
export const hasAttachmentContent = (attach?: ChatAttachment | null): boolean => {
    if (!attach) return false;
    const hasText = [attach.pretext, attach.title, attach.text, attach.footer, attach.username].some(
        value => !!value?.trim()
    );
    return hasText || !!attach.fields?.length || !!safeAttachmentUrl(attach.sourceUrl);
};

/**
 * The accent colour for the card's left rail, as a CSS colour.
 *
 * `color` follows the Slack lineage: three severity words or a raw hex. The words map to tokens so
 * the card follows the theme; a hex is taken literally because only the sender knows what it means.
 * Anything else (including nothing) gets the neutral border, so an unknown word can never leave the
 * rail invisible.
 */
export const resolveAttachmentAccent = (color?: string): string => {
    const value = color?.trim().toLowerCase();
    if (value === 'danger') return 'hsl(var(--destructive))';
    if (value === 'good') return 'hsl(var(--main-accent))';
    // No amber token exists in the kit, and the three severity words are a fixed set — a literal is
    // honest here rather than bending an unrelated token into a warning colour.
    if (value === 'warning') return '#F5A623';
    if (value && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(value)) return value;
    return 'hsl(var(--input-border))';
};
