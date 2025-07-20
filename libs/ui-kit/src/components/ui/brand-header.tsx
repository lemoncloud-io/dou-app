import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@lemon/lib/utils';

const brandHeaderVariants = cva('fixed top-0 left-0 right-0 z-10 bg-white', {
    variants: {
        showBorder: {
            true: 'border-b border-chatic-neutral-100',
            false: '',
        },
    },
    defaultVariants: {
        showBorder: false,
    },
});

const brandLogoVariants = cva(
    'font-chatic-brand font-normal tracking-[-1.38px] bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] bg-clip-text',
    {
        variants: {
            size: {
                default: 'text-chatic-3xl',
                sm: 'text-chatic-2xl',
                lg: 'text-chatic-4xl',
            },
        },
        defaultVariants: {
            size: 'default',
        },
    }
);

interface BrandHeaderProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof brandHeaderVariants> {
    logoSize?: VariantProps<typeof brandLogoVariants>['size'];
    logoClassName?: string;
}

const BrandHeader = React.forwardRef<HTMLDivElement, BrandHeaderProps>(
    ({ className, showBorder, logoSize, logoClassName, ...props }, ref) => {
        return (
            <div ref={ref} className={cn(brandHeaderVariants({ showBorder }), className)} {...props}>
                <div className="flex items-center justify-start px-chatic-md py-chatic-md">
                    <h1
                        className={cn(brandLogoVariants({ size: logoSize }), logoClassName)}
                        style={{
                            WebkitTextFillColor: 'transparent',
                            backgroundImage:
                                'linear-gradient(to right, #0b1933 3.75%, #102f6b 46.884%, #3968c3 94.375%)',
                        }}
                    >
                        Chatic
                    </h1>
                </div>
            </div>
        );
    }
);
BrandHeader.displayName = 'BrandHeader';

export { BrandHeader, brandHeaderVariants, brandLogoVariants };
export type { BrandHeaderProps };
