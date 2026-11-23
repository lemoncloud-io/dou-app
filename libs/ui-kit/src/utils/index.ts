import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            z: [{ z: ['raised', 'float', 'overlay', 'drawer', 'toast', 'popover', 'alert'] }],
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
