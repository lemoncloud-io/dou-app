import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { GuideBulletList } from './GuideBulletList';

describe('GuideBulletList', () => {
    it('renders a description line only when the item has one', () => {
        render(
            <GuideBulletList
                tone="emphasis"
                items={[{ title: '플레이스 만들기', description: '주제별 공간 만들기' }, { title: '그룹 대화방' }]}
            />
        );

        expect(screen.getByText('주제별 공간 만들기')).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('emphasises PRO benefit titles and mutes FREE limitation rows', () => {
        const { rerender, container } = render(<GuideBulletList items={[{ title: '그룹 대화 제한' }]} />);
        expect(screen.getByText('그룹 대화 제한')).toHaveClass('text-description');
        expect(container.querySelector('li > span')).toHaveClass('bg-input-border');

        rerender(<GuideBulletList tone="emphasis" items={[{ title: '나만의 클라우드' }]} />);
        expect(screen.getByText('나만의 클라우드')).toHaveClass('text-foreground');
        expect(container.querySelector('li > span')).toHaveClass('bg-foreground');
    });
});
