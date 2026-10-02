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
//
// And for the hosts' named animations: the toast primitive ships its own enter/exit animations
// and each toaster swaps them for its own (`animate-snackbar-in`, `animate-toast-in`). Unregistered,
// both survive the merge and whichever the config happens to declare later wins.
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            z: [{ z: ['raised', 'float', 'overlay', 'drawer', 'toast', 'popover'] }],
            animate: [
                {
                    animate: [
                        'fade-in',
                        'fade-out',
                        'slide-in-from-top',
                        'slide-in-from-bottom',
                        'slide-out-to-top',
                        'slide-out-to-right',
                        'toast-in',
                        'toast-out',
                        'snackbar-in',
                        'snackbar-out',
                    ],
                },
            ],
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
