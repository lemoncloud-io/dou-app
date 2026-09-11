import * as React from 'react';

export interface IconEmojiAddProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (glyph is square). */
    size?: number;
}

/**
 * Add-reaction glyph — a smiling face with a plus at its top-right corner (Figma
 * "Add Icon", 4701:43432). It is the affordance at the end of every reaction chip row
 * and of the action sheet's quick row, so it has to read as "add ANOTHER reaction"
 * rather than the bare `+` that stood there before: a plus alone said "add something"
 * without saying what.
 *
 * The plus overshoots the 20×20 box on the right, which is why the source viewBox is
 * kept verbatim — trimming it to a square would clip the stroke.
 */
export const IconEmojiAdd = ({ size = 18, className, ...props }: IconEmojiAddProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        {/* Mouth */}
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M11.8577 13.1169C12.1204 12.9221 12.491 12.9772 12.6858 13.2399C12.8804 13.5026 12.8254 13.8732 12.5627 14.0679C11.7951 14.6368 10.8561 14.9737 9.8418 14.9737C8.82746 14.9736 7.8885 14.6369 7.12089 14.0679C6.85834 13.8733 6.80343 13.5026 6.99784 13.2399C7.19256 12.9772 7.56316 12.9222 7.82586 13.1169C8.40079 13.543 9.09515 13.7894 9.8418 13.7895C10.5884 13.7895 11.2828 13.5429 11.8577 13.1169Z"
            fill="currentColor"
        />
        {/* Eyes */}
        <path
            d="M12.2102 8.06548C12.6462 8.06548 13.0002 8.59581 13.0003 9.24969C13.0003 9.90371 12.6462 10.4339 12.2102 10.4339C11.7743 10.4337 11.4211 9.90356 11.4211 9.24969C11.4212 8.59597 11.7744 8.06573 12.2102 8.06548Z"
            fill="currentColor"
        />
        <path
            d="M7.47338 8.06548C7.90932 8.06548 8.26336 8.59581 8.26347 9.24969C8.26347 9.90371 7.90939 10.4339 7.47338 10.4339C7.0375 10.4337 6.68421 9.90356 6.68421 9.24969C6.68432 8.59597 7.03757 8.06573 7.47338 8.06548Z"
            fill="currentColor"
        />
        {/* Face outline — open at the top right, where the plus sits */}
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M9.48653 1.94737C9.81354 1.94737 10.0786 2.21246 10.0786 2.53947C10.0786 2.86648 9.81354 3.13158 9.48653 3.13158C5.45365 3.13175 2.18438 6.40102 2.18421 10.4339C2.18421 14.4669 5.45354 17.737 9.48653 17.7372C13.5197 17.7372 16.7898 14.467 16.7898 10.4339C16.79 10.107 17.055 9.8418 17.3819 9.8418C17.7087 9.84196 17.9738 10.1071 17.974 10.4339C17.974 15.1211 14.1737 18.9214 9.48653 18.9214C4.79952 18.9212 1 15.121 1 10.4339C1.00017 5.74699 4.79963 1.94754 9.48653 1.94737Z"
            fill="currentColor"
        />
        {/* Plus */}
        <path
            d="M15.5869 0.294434C15.9182 0.294434 16.1863 0.562847 16.1865 0.894043V2.98779H18.2871C18.6185 2.98782 18.8867 3.25605 18.8867 3.5874C18.8867 3.91874 18.6184 4.18699 18.2871 4.18701H16.1865V6.2876C16.1865 6.61897 15.9183 6.88818 15.5869 6.88818C15.2557 6.88805 14.9873 6.61889 14.9873 6.2876V4.18701H12.8936C12.5622 4.18701 12.293 3.91876 12.293 3.5874C12.293 3.25603 12.5622 2.98779 12.8936 2.98779H14.9873V0.894043C14.9875 0.562929 15.2558 0.294567 15.5869 0.294434Z"
            fill="currentColor"
        />
    </svg>
);
