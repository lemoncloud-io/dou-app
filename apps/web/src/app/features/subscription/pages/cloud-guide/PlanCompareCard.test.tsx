import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { GuideBulletList } from './GuideBulletList';
import { PlanCompareCard } from './PlanCompareCard';

describe('PlanCompareCard', () => {
    it('renders the header, badge, headline and children', () => {
        render(
            <PlanCompareCard name="DoU Home" tier="free" tierLabel="FREE" headline="바로 대화를 시작하는 공간">
                <GuideBulletList items={[{ title: '그룹 대화 제한' }]} />
            </PlanCompareCard>
        );

        expect(screen.getByText('DoU Home')).toBeInTheDocument();
        expect(screen.getByText('FREE')).toBeInTheDocument();
        expect(screen.getByText('바로 대화를 시작하는 공간')).toBeInTheDocument();
        expect(screen.getByText('그룹 대화 제한')).toBeInTheDocument();
    });

    it('exposes the tier so the two cards are distinguishable', () => {
        // Asserted via data-tier rather than the header's background class: a pure restyle must not
        // break this, and a FREE card wrongly rendered as PRO must.
        const { container } = render(
            <PlanCompareCard name="내 클라우드" tier="pro" tierLabel="PRO" headline="내가 만드는 나만의 공간">
                <span>benefits</span>
            </PlanCompareCard>
        );

        expect(container.querySelector('[data-tier="pro"]')).not.toBeNull();
        expect(container.querySelector('[data-tier="free"]')).toBeNull();
    });
});
