import { cn } from '@chatic/lib/utils';

const SIZE = { sm: 36, md: 40, lg: 46 } as const;

// Deterministic background palette for the initials fallback — chosen for
// readable white-text contrast. Not part of the semantic token set since it's
// a hash-derived rotation, not a single meaningful color.
const PALETTE = [
    'bg-[#F2637B]',
    'bg-[#F2994A]',
    'bg-[#B0A32B]',
    'bg-[#6FCF97]',
    'bg-[#4FB8C4]',
    'bg-[#2F80ED]',
    'bg-[#9B51E0]',
    'bg-[#C2549E]',
] as const;

const hashIndex = (value: string, length: number): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % length;
};

export interface CloudAvatarProps {
    /** Cloud name — drives both the initial glyph and the deterministic tone. */
    name: string;
    /** Diameter step (Small 36 / Medium 40 / Large 46). */
    size?: keyof typeof SIZE;
    className?: string;
}

/**
 * Cloud initials avatar — Slack-style fallback for a cloud without an
 * owner-set profile photo: the name's first character on a color derived
 * deterministically from the name, so the same cloud always gets the same tone.
 */
export const CloudAvatar = ({ name, size = 'lg', className }: CloudAvatarProps) => {
    const trimmed = name.trim();
    const initial = trimmed ? [...trimmed][0].toUpperCase() : '?';
    const px = SIZE[size];

    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white',
                PALETTE[hashIndex(trimmed, PALETTE.length)],
                className
            )}
            style={{ width: px, height: px, fontSize: Math.round(px * 0.42) }}
        >
            {initial}
        </span>
    );
};
