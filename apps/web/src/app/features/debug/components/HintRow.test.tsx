import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HintRow } from './HintRow';

/**
 * The two ways in are the contract. A hover-only tooltip would be invisible on the devices this
 * panel is actually used on, and Radix's Tooltip is hover-only by design (it closes on
 * `pointerdown`), which is why this component exists instead.
 */
describe('HintRow — 설명이 붙은 행', () => {
    it('라벨과 값을 보여주고 설명은 접어둔다', () => {
        render(<HintRow label="깊이" value="2칸" hint="앱이 쌓은 항목 수입니다." />);

        expect(screen.getByText('2칸')).toBeInTheDocument();
        expect(screen.queryByText('앱이 쌓은 항목 수입니다.')).not.toBeInTheDocument();
    });

    it('호버용으로 title 속성에 같은 설명을 담는다', () => {
        render(<HintRow label="깊이" value="2칸" hint="앱이 쌓은 항목 수입니다." />);

        expect(screen.getByRole('button', { name: '깊이' })).toHaveAttribute('title', '앱이 쌓은 항목 수입니다.');
    });

    it('누르면 펼치고 다시 누르면 접는다', async () => {
        render(<HintRow label="깊이" value="2칸" hint="앱이 쌓은 항목 수입니다." />);
        const label = screen.getByRole('button', { name: '깊이' });

        await userEvent.click(label);
        expect(screen.getByText('앱이 쌓은 항목 수입니다.')).toBeInTheDocument();
        expect(label).toHaveAttribute('aria-expanded', 'true');

        await userEvent.click(label);
        expect(screen.queryByText('앱이 쌓은 항목 수입니다.')).not.toBeInTheDocument();
    });

    it('값이 없으면 Row와 같은 자리표시자를 쓴다', () => {
        render(<HintRow label="깊이" value={null} hint="앱이 쌓은 항목 수입니다." />);

        expect(screen.getByText('—')).toBeInTheDocument();
    });
});
