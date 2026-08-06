/**
 * Bolds the first occurrence of `query` inside `text`, trimming a long lead with an
 * ellipsis so the match stays visible in a single-line row. Ported from desktop-web's
 * SearchDialog highlight() (apps/desktop-web/.../SearchDialog.tsx).
 */
export const HighlightText = ({ text, query, className }: { text: string; query: string; className?: string }) => {
    const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if (at < 0) {
        return <span className={className}>{text}</span>;
    }

    const lead = at > 32 ? `…${text.slice(at - 24, at)}` : text.slice(0, at);

    return (
        <span className={className}>
            {lead}
            <strong className="font-semibold text-foreground">{text.slice(at, at + query.length)}</strong>
            {text.slice(at + query.length)}
        </span>
    );
};
