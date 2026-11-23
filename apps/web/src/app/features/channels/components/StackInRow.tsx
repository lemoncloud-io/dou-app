import { useRef, type HTMLAttributes } from 'react';

import { useStackIn } from '../hooks/useStackIn';

type StackInRowProps = HTMLAttributes<HTMLDivElement> & {
    enter: boolean;
    'data-chat-no'?: number;
};

export const StackInRow = ({ enter, children, ...rest }: StackInRowProps) => {
    const ref = useRef<HTMLDivElement>(null);
    useStackIn(ref, enter);
    return (
        <div ref={ref} {...rest}>
            {children}
        </div>
    );
};
