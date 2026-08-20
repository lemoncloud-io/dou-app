import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { AddAccountButton } from './AddAccountButton';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe('AddAccountButton — 구독(PRO) 뱃지 (Figma 3769:34789)', () => {
    it('PRO 마커를 그리지만 자체 버튼으로 만들지는 않는다', () => {
        render(<AddAccountButton onClick={jest.fn()} />);

        const addButton = screen.getByRole('button', { name: /cloudSessionSheet\.addAccount/ });
        expect(addButton).toHaveTextContent('PRO');

        // button-in-button is invalid HTML and would punch a hole in the parent's tap target, so the
        // badge must be a plain span — the add pill stays the only button in this footer.
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(addButton.querySelector('button')).toBeNull();
    });

    it('뱃지는 실제 멤버십 상태가 아니라 정적 기능 마커다', () => {
        // No props and no subscription store: the marker never flips to FREE.
        render(<AddAccountButton onClick={jest.fn()} />);

        expect(screen.getByRole('button')).not.toHaveTextContent('FREE');
        // Green outline == SubscriptionButton's `tier="pro"` look, via the token not a raw hex.
        expect(screen.getByText('PRO').className).toContain('border-main-accent');
    });
});
