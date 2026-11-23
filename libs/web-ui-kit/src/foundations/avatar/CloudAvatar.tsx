import { cn } from '@chatic/ui-kit';

const SIZE = { sm: 36, md: 40, lg: 46, xl: 86 } as const;

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
    name: string;
    size?: keyof typeof SIZE;
    className?: string;
}

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
