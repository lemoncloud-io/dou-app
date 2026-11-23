import { cn } from '@chatic/ui-kit';

export interface ProgressRingProps {
    ratio: number;
    size?: number;
    stop?: boolean;
    trackClassName?: string;
    fillClassName?: string;
    stopClassName?: string;
}

export const ProgressRing = ({
    ratio,
    size = 28,
    stop = false,
    trackClassName = 'stroke-border',
    fillClassName = 'stroke-foreground',
    stopClassName = 'fill-foreground',
}: ProgressRingProps) => {
    const stroke = size * (2.5 / 28);
    const radius = (size - stroke) / 2 - size * (0.75 / 28);
    const length = 2 * Math.PI * radius;
    const centre = size / 2;
    const mark = size / 4;
    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            fill="none"
            aria-hidden="true"
            data-progress-ring
        >
            <circle cx={centre} cy={centre} r={radius} strokeWidth={stroke} className={trackClassName} />
            <circle
                cx={centre}
                cy={centre}
                r={radius}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={length}
                strokeDashoffset={length * (1 - ratio)}
                transform={`rotate(-90 ${centre} ${centre})`}
                className={cn(
                    'transition-[stroke-dashoffset] duration-200 ease-linear motion-reduce:transition-none',
                    fillClassName
                )}
            />
            {stop && (
                <rect
                    x={centre - mark / 2}
                    y={centre - mark / 2}
                    width={mark}
                    height={mark}
                    rx={mark * (1.5 / 7)}
                    className={stopClassName}
                />
            )}
        </svg>
    );
};
