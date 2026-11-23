import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { AddAccountButton } from './AddAccountButton';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe('AddAccountButton — 구독(PRO) 뱃지 (Figma 3769:34789)', () => {
    it('PRO 마커를 그리지만 자체 버튼으로 만들지는 않는다', () => {
        render(<AddAccountButton onClick={jest.fn()} />);

        const addButton = screen.getByRole('button', { name: /cloudSessionSheet\.addAccount/ });
        expect(addButton).toHaveTextContent('PRO');

        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(addButton.querySelector('button')).toBeNull();
    });

    it('뱃지는 실제 멤버십 상태가 아니라 정적 기능 마커다', () => {
        render(<AddAccountButton onClick={jest.fn()} />);

        expect(screen.getByRole('button')).not.toHaveTextContent('FREE');
        expect(screen.getByText('PRO').className).toContain('border-main-accent');
    });
});
