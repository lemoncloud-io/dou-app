import { render } from '@testing-library/react';

import { CloudAvatar } from './CloudAvatar';

describe('CloudAvatar', () => {
    it('renders the first character as the initial', () => {
        const { getByText } = render(<CloudAvatar name="스터디 플레이스" />);
        expect(getByText('스')).toBeInTheDocument();
    });

    it('uppercases a latin initial', () => {
        const { getByText } = render(<CloudAvatar name="doU Home" />);
        expect(getByText('D')).toBeInTheDocument();
    });

    it('falls back to "?" for an empty name', () => {
        const { getByText } = render(<CloudAvatar name="   " />);
        expect(getByText('?')).toBeInTheDocument();
    });

    it('is deterministic — same name always gets the same tone', () => {
        const first = render(<CloudAvatar name="Sunny Place" />);
        const firstClass = (first.container.firstElementChild as HTMLElement).className;
        first.unmount();

        const second = render(<CloudAvatar name="Sunny Place" />);
        const secondClass = (second.container.firstElementChild as HTMLElement).className;

        expect(secondClass).toBe(firstClass);
    });

    it('sizes by step', () => {
        const { container } = render(<CloudAvatar name="DoU" size="sm" />);
        expect((container.firstElementChild as HTMLElement).style.width).toBe('36px');
    });
});
