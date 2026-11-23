import { useEffect, useMemo, useRef, useState } from 'react';

import { XCircle } from 'lucide-react';

import type { KnownBlock } from '@chatic/block-kit';
import { cn } from '@chatic/ui-kit';

import { highlightJsonLine } from './highlightJson';
import { blocksToPayloadJson, payloadJsonToBlocks, type PayloadParseFailure } from './payloadCodec';

interface PayloadPaneProps {
    json: string;
    onBlocks: (blocks: KnownBlock[]) => void;
    onError: (failure: PayloadParseFailure | null) => void;
}

const CODE = 'font-mono text-[16px] leading-relaxed lg:text-caption';

export const PayloadPane = ({ json, onBlocks, onError }: PayloadPaneProps) => {
    const [draft, setDraft] = useState(json);
    const [failure, setFailure] = useState<PayloadParseFailure | null>(null);

    const lastEmitted = useRef(json);

    const report = (next: PayloadParseFailure | null) => {
        setFailure(next);
        onError(next);
    };

    useEffect(() => {
        if (json === lastEmitted.current) return;
        lastEmitted.current = json;
        setDraft(json);
        report(null);
    }, [json]);

    const edit = (value: string) => {
        setDraft(value);
        const result = payloadJsonToBlocks(value);
        if (!result.ok) {
            report(result);
            return;
        }
        report(null);
        lastEmitted.current = blocksToPayloadJson(result.blocks);
        onBlocks(result.blocks);
    };

    const lines = useMemo(() => draft.split('\n'), [draft]);

    const gutter = useRef<HTMLDivElement>(null);
    const colours = useRef<HTMLPreElement>(null);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="relative flex min-h-0 flex-1">
                <div
                    ref={gutter}
                    className={cn(CODE, 'z-10 shrink-0 select-none overflow-hidden px-2 text-right tabular-nums')}
                >
                    {lines.map((_, index) => {
                        const blamed = failure?.line === index + 1;
                        return (
                            <div
                                key={index}
                                className={cn(
                                    'flex items-center justify-end gap-1',
                                    blamed
                                        ? 'font-semibold text-[hsl(var(--code-error-line))]'
                                        : 'text-muted-foreground/40'
                                )}
                            >
                                {blamed && (
                                    <span role="img" aria-label={`Payload line ${index + 1} failed to parse`}>
                                        <XCircle size={11} className="shrink-0" />
                                    </span>
                                )}
                                <span aria-hidden>{index + 1}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="relative min-w-0 flex-1">
                    <pre
                        ref={colours}
                        aria-hidden
                        className={cn(
                            CODE,
                            'pointer-events-none absolute inset-0 m-0 overflow-hidden pr-4',
                            'text-[hsl(var(--code-punctuation))]'
                        )}
                    >
                        {lines.map((line, index) => (
                            <div
                                key={index}
                                className={
                                    failure?.line === index + 1
                                        ? 'w-max min-w-full bg-[hsl(var(--code-error-line)/0.12)]'
                                        : undefined
                                }
                            >
                                {highlightJsonLine(line)}
                            </div>
                        ))}
                    </pre>

                    <textarea
                        aria-label="Payload JSON"
                        spellCheck={false}
                        wrap="off"
                        value={draft}
                        onChange={event => edit(event.target.value)}
                        onScroll={event => {
                            const { scrollTop, scrollLeft } = event.currentTarget;
                            if (gutter.current) gutter.current.scrollTop = scrollTop;
                            if (colours.current) {
                                colours.current.scrollTop = scrollTop;
                                colours.current.scrollLeft = scrollLeft;
                            }
                        }}
                        className={cn(
                            CODE,
                            'focus-ring absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent pr-4',
                            'text-transparent caret-foreground selection:bg-primary/25'
                        )}
                    />
                </div>
            </div>
        </div>
    );
};
