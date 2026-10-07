import * as React from 'react';

import type { EditSize } from './photoEdit';

const NO_BOX: EditSize = { width: 0, height: 0 };

/**
 * An element's inner size, kept current as it resizes — a rotated phone, a footer that grows a line.
 * Returns a callback ref to put on the element, and its size (0×0 until it has been measured).
 *
 * The element is held in state rather than a ref: inside a dialog the content mounts into a portal a
 * commit after the component renders, and an effect keyed on a ref would have run on the empty one
 * and never again. Without `ResizeObserver` (jsdom, an old WebView) the size is read once at mount.
 */
export const useBoxSize = <T extends HTMLElement>(): readonly [(node: T | null) => void, EditSize] => {
    const [node, setNode] = React.useState<T | null>(null);
    const [size, setSize] = React.useState<EditSize>(NO_BOX);

    // A layout effect, so the first paint already has the size and nothing is drawn at 0×0 first.
    React.useLayoutEffect(() => {
        if (!node) {
            setSize(NO_BOX);
            return undefined;
        }
        const measure = () => {
            const next = { width: node.clientWidth, height: node.clientHeight };
            setSize(previous => (previous.width === next.width && previous.height === next.height ? previous : next));
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [node]);

    return [setNode, size] as const;
};
