import * as React from 'react';

import type { EditSize } from './photoEdit';

const NO_BOX: EditSize = { width: 0, height: 0 };

export const useBoxSize = <T extends HTMLElement>(): readonly [(node: T | null) => void, EditSize] => {
    const [node, setNode] = React.useState<T | null>(null);
    const [size, setSize] = React.useState<EditSize>(NO_BOX);

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
