import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { PlanCard } from './PlanCard';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const plan = { id: '#pro-tier-03', name: '3단계', sort: 3, maxClouds: 3 } as ProductView;

const renderCard = (props: Partial<React.ComponentProps<typeof PlanCard>> = {}) => {
    const onSelect = jest.fn();
    render(<PlanCard product={plan} isSelected={false} isBlocked={false} isKo onSelect={onSelect} {...props} />);
    return { onSelect, card: screen.getByRole('button') };
};

describe('PlanCard — 고를 수 없는 등급', () => {
    it('탭을 그대로 올려보낸다 — 화면이 사유를 띄울 수 있게', () => {
        const { onSelect, card } = renderCard({
            isSelectable: false,
            disabledReason: 'mypage.subscription.adjacentTierOnly',
        });

        fireEvent.click(card);

        expect(onSelect).toHaveBeenCalledWith(plan);
    });

    it('비활성으로 보이고 그렇게 읽히지만, 버튼 자체는 살아 있다', () => {
        const { card } = renderCard({ isSelectable: false });

        expect(card).toHaveAttribute('aria-disabled', 'true');
        expect(card).toBeEnabled();
    });

    it('이용 중인 등급도 탭할 수 있다 — "이미 구독 중"이라고 말해줄 수 있어야 한다', () => {
        const { onSelect, card } = renderCard({ isCurrent: true, isSelectable: false });

        fireEvent.click(card);

        expect(onSelect).toHaveBeenCalledWith(plan);
    });
});

describe('PlanCard — 결제 진행 중', () => {
    it('결제가 도는 동안만 실제로 막는다', () => {
        const { onSelect, card } = renderCard({ isBlocked: true });

        expect(card).toBeDisabled();
        fireEvent.click(card);

        expect(onSelect).not.toHaveBeenCalled();
    });
});
