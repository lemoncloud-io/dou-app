import { render, screen } from '@testing-library/react';

import { SystemMessage } from './SystemMessage';

describe('SystemMessage', () => {
    it('renders the title alone', () => {
        const { container } = render(<SystemMessage title="대화 상대가 채팅방에 입장했습니다." />);

        expect(screen.getByText('대화 상대가 채팅방에 입장했습니다.')).toBeTruthy();
        expect(container.querySelectorAll('p')).toHaveLength(1);
    });

    it('renders the supporting line when given', () => {
        render(<SystemMessage title="토끼님이 채팅방에 입장했습니다." description="1:1 대화를 시작해 보세요." />);

        expect(screen.getByText('토끼님이 채팅방에 입장했습니다.')).toBeTruthy();
        expect(screen.getByText('1:1 대화를 시작해 보세요.')).toBeTruthy();
    });

    it('renders a left-aligned block, not a centered pill', () => {
        const { container } = render(<SystemMessage title="x" />);
        const block = container.firstElementChild;

        expect(block?.className).toContain('items-start');
        expect(block?.className).not.toContain('rounded-full');
    });

    // The Figma chat-entry spec (3086:14439) is the reason this component's typography changed; pin
    // it so a silent revert to the old 16/15px sizing fails here.
    it('uses the Figma entry-notice type scale', () => {
        const { container } = render(<SystemMessage title="title" description="description" />);
        const [title, description] = Array.from(container.querySelectorAll('p'));

        expect(title.className).toContain('text-[18px]');
        expect(title.className).toContain('leading-[26px]');
        expect(title.className).toContain('font-semibold');
        expect(description.className).toContain('text-[16px]');
        expect(description.className).toContain('leading-[22px]');
        expect(description.className).toContain('text-label');
    });

    it('lets the host adjust spacing through className', () => {
        const { container } = render(<SystemMessage title="x" className="pt-0" />);

        expect(container.firstElementChild?.className).toContain('pt-0');
    });
});
