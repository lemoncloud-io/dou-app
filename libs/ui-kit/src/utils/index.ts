import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Register the project's custom font-size tokens (desktop-web's semantic type
// scale) with tailwind-merge. Without this, twMerge treats `text-callout`,
// `text-micro`, etc. as text-COLOR utilities and silently drops them whenever a
// span also carries a real color class (`text-foreground`), collapsing the whole
// type scale back to the 16px browser default.
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-size': [{ text: ['display', 'title', 'heading', 'body', 'callout', 'caption', 'micro', 'overline'] }],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
