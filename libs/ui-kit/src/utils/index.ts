import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Register the project's custom font-size tokens (desktop-web's semantic type
// scale) with tailwind-merge. Without this, twMerge treats `text-callout`,
// `text-micro`, etc. as text-COLOR utilities and silently drops them whenever a
// span also carries a real color class (`text-foreground`), collapsing the whole
// type scale back to the 16px browser default.
//
// The same holds for desktop-web's named stacking scale: unregistered, `z-toast` is not seen as a
// z-index, so passing it to a kit component that sets `z-[100]` keeps both and the stylesheet's
// order decides which one applies.
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            z: [{ z: ['raised', 'float', 'overlay', 'drawer', 'toast', 'popover'] }],
            'font-size': [
                {
                    text: [
                        'display',
                        'headline',
                        'title',
                        'heading',
                        'lead',
                        'body',
                        'callout',
                        'caption',
                        'micro',
                        'tiny',
                        'nano',
                        'overline',
                    ],
                },
            ],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
