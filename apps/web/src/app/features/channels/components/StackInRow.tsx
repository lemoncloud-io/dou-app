import { useRef, type HTMLAttributes } from 'react';

import { useStackIn } from '../hooks/useStackIn';

type StackInRowProps = HTMLAttributes<HTMLDivElement> & {
    /** Play the entrance when this row mounts — read once, at mount. */
    enter: boolean;
    'data-chat-no'?: number;
};

/** A message row's wrapper that can stack itself onto the list as it mounts (see `useStackIn`). */
export const StackInRow = ({ enter, children, ...rest }: StackInRowProps) => {
    const ref = useRef<HTMLDivElement>(null);
    useStackIn(ref, enter);
    return (
        <div ref={ref} {...rest}>
            {children}
        </div>
    );
};
