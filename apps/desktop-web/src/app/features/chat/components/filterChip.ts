export const FILTER_CHIP =
    'focus-ring tactile flex h-8 items-center gap-1.5 rounded-full border px-3 text-micro font-medium transition-colors ease-tactile disabled:pointer-events-none disabled:opacity-50';

export const filterChipTone = (on: boolean): string =>
    on ? 'border-foreground bg-foreground text-background' : 'border-hairline text-foreground hover:bg-accent';
