/**
 * Flatten message markdown to plain text for single-line surfaces (sidebar
 * preview, OS notification body) — markers there read as noise. Inverse-ish of
 * what RichText renders: fences first (their content stays literal), then
 * inline marks, then quote prefixes. Mentions/links stay as-is.
 */
export const stripMarkdown = (content: string): string =>
    content
        .replace(/```[\s\S]*?```/g, m => m.slice(3, -3).trim())
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/~~([^~\n]+)~~/g, '$1')
        .replace(/^>\s?/gm, '');
