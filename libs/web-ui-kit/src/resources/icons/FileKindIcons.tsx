import * as React from 'react';

export interface FileKindIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

const SHEET =
    'M9 2.5H19V8.5C19 10.16 20.34 11.5 22 11.5H27V26.5C27 28.16 25.66 29.5 24 29.5H9C7.34 29.5 6 28.16 6 26.5V5.5C6 3.84 7.34 2.5 9 2.5Z';
const FOLD = 'M20.5 2.5L27 9H22.5C21.4 9 20.5 8.1 20.5 7V2.5Z';

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

export const IconFilePdf = (props: FileKindIconProps) => <FileKindGlyph tag="PDF" {...props} />;
export const IconFileDoc = (props: FileKindIconProps) => <FileKindGlyph tag="DOC" {...props} />;
export const IconFileSheet = (props: FileKindIconProps) => <FileKindGlyph tag="XLS" {...props} />;
export const IconFileSlides = (props: FileKindIconProps) => <FileKindGlyph tag="PPT" {...props} />;
export const IconFileHangul = (props: FileKindIconProps) => <FileKindGlyph tag="HWP" {...props} />;
export const IconFileText = (props: FileKindIconProps) => <FileKindGlyph tag="TXT" {...props} />;
export const IconFileGeneric = (props: FileKindIconProps) => <FileKindGlyph {...props} />;
