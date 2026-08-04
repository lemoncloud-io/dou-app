import { render, screen } from '@testing-library/react';

import { PlanBulletList } from './PlanBulletList';
import { PlanCompareCard } from './PlanCompareCard';

describe('PlanCompareCard', () => {
    it('renders the header, badge, headline and children', () => {
        render(
            <PlanCompareCard name="DoU Home" tier="free" tierLabel="FREE" headline="바로 대화를 시작하는 공간">
                <PlanBulletList items={[{ title: '그룹 대화 제한' }]} />
            </PlanCompareCard>
        );

        expect(screen.getByText('DoU Home')).toBeInTheDocument();
        expect(screen.getByText('FREE')).toBeInTheDocument();
        expect(screen.getByText('바로 대화를 시작하는 공간')).toBeInTheDocument();
        expect(screen.getByText('그룹 대화 제한')).toBeInTheDocument();
    });

    it('exposes the tier so the two cards are distinguishable', () => {
        // Asserted via data-tier rather than the header's background class: a pure restyle must not
        // break this, and a free card wrongly rendered as paid must.
        const { container } = render(
            <PlanCompareCard name="내 클라우드" tier="paid" tierLabel="PRO" headline="내가 만드는 나만의 공간">
                <span>benefits</span>
            </PlanCompareCard>
        );

        expect(container.querySelector('[data-tier="paid"]')).not.toBeNull();
        expect(container.querySelector('[data-tier="free"]')).toBeNull();
    });

    it('gives only the paid card the lime glow', () => {
        // The glow is what separates the upsell card from the free one at a glance (Figma 3519-29690).
        const { container: paid } = render(
            <PlanCompareCard name="내 클라우드" tier="paid" tierLabel="PRO" headline="h">
                <span />
            </PlanCompareCard>
        );
        expect((paid.firstElementChild as HTMLElement).className).toContain('shadow-');

        const { container: free } = render(
            <PlanCompareCard name="DoU Home" tier="free" tierLabel="FREE" headline="h">
                <span />
            </PlanCompareCard>
        );
        expect((free.firstElementChild as HTMLElement).className).not.toContain('shadow-');
    });
});
