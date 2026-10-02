import * as React from 'react';

export interface FileKindIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

// The sheet with its top-right corner folded away, on a 32×32 frame. The corner is cut out of the
// sheet rather than drawn over it, so the fold reads the same on any surface the card sits on.
const SHEET =
    'M9 2.5H19V8.5C19 10.16 20.34 11.5 22 11.5H27V26.5C27 28.16 25.66 29.5 24 29.5H9C7.34 29.5 6 28.16 6 26.5V5.5C6 3.84 7.34 2.5 9 2.5Z';
const FOLD = 'M20.5 2.5L27 9H22.5C21.4 9 20.5 8.1 20.5 7V2.5Z';

/**
 * The shared shape of every file-kind glyph: a sheet and its folded corner in `currentColor`, and an
 * optional short format tag knocked out in white across its lower half.
 *
 * The tag is what tells the kinds apart. Colour does too — the card tints each kind — but colour
 * alone fails a reader who cannot tell red from green, and a tinted sheet with no word on it says
 * nothing about which program opens it. A generic file carries no tag: "FILE" would only restate
 * the sheet.
 */
const FileKindGlyph = ({ tag, size = 32, className, ...props }: FileKindIconProps & { tag?: string }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <path d={SHEET} fill="currentColor" />
        <path d={FOLD} fill="currentColor" opacity={0.5} />
        {tag && (
            <text
                x="16.5"
                y="23.5"
                textAnchor="middle"
                fontSize="7"
                fontWeight="700"
                letterSpacing="-0.2"
                fontFamily="inherit"
                className="fill-white"
            >
                {tag}
            </text>
        )}
    </svg>
);

/**
 * File-kind glyphs for a chat document card — one per family of format the server accepts, plus a
 * generic sheet for anything else (an old upload with no name, a format added later). Each is the
 * same sheet with a different format tag; the card picks the glyph from the file's extension and
 * tints it.
 */
export const IconFilePdf = (props: FileKindIconProps) => <FileKindGlyph tag="PDF" {...props} />;
/** Word-processor documents (`docx`, and the older `doc`). */
export const IconFileDoc = (props: FileKindIconProps) => <FileKindGlyph tag="DOC" {...props} />;
/** Spreadsheets (`xlsx`, `xls`, `csv`). */
export const IconFileSheet = (props: FileKindIconProps) => <FileKindGlyph tag="XLS" {...props} />;
/** Presentations (`pptx`, `ppt`). */
export const IconFileSlides = (props: FileKindIconProps) => <FileKindGlyph tag="PPT" {...props} />;
/** Hangul word-processor documents (`hwp`, `hwpx`). */
export const IconFileHangul = (props: FileKindIconProps) => <FileKindGlyph tag="HWP" {...props} />;
/** Plain text. */
export const IconFileText = (props: FileKindIconProps) => <FileKindGlyph tag="TXT" {...props} />;
/** Anything without a more specific glyph. */
export const IconFileGeneric = (props: FileKindIconProps) => <FileKindGlyph {...props} />;
