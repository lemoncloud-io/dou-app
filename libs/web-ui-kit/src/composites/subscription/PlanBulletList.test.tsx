import { render, screen } from '@testing-library/react';

import { PlanBulletList } from './PlanBulletList';

describe('PlanBulletList', () => {
    it('renders a description line only when the item has one', () => {
        render(
            <PlanBulletList
                tone="emphasis"
                items={[{ title: '플레이스 만들기', description: '주제별 공간 만들기' }, { title: '그룹 대화방' }]}
            />
        );

        expect(screen.getByText('주제별 공간 만들기')).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('emphasises paid benefit titles and mutes free limitation rows', () => {
        const { rerender, container } = render(<PlanBulletList items={[{ title: '그룹 대화 제한' }]} />);
        expect(screen.getByText('그룹 대화 제한')).toHaveClass('text-description');
        expect(container.querySelector('li > span')).toHaveClass('bg-input-border');

        rerender(<PlanBulletList tone="emphasis" items={[{ title: '나만의 클라우드' }]} />);
        expect(screen.getByText('나만의 클라우드')).toHaveClass('text-foreground');
        expect(container.querySelector('li > span')).toHaveClass('bg-foreground');
    });
});
