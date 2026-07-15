import { render, screen } from '@testing-library/react';

import { SystemNotice } from './SystemNotice';

describe('SystemNotice', () => {
    it('renders the composed notice content', () => {
        render(
            <SystemNotice>
                <b>레몬</b>님이 채팅방에 입장했습니다.
            </SystemNotice>
        );

        expect(screen.getByText('레몬')).toBeTruthy();
        expect(screen.getByText(/님이 채팅방에 입장했습니다/)).toBeTruthy();
    });

    it('renders a centered pill', () => {
        const { container } = render(<SystemNotice>x</SystemNotice>);
        const pill = container.querySelector('span');

        expect(pill?.className).toContain('rounded-full');
        expect(pill?.className).toContain('bg-brand-ink/5');
    });
});
