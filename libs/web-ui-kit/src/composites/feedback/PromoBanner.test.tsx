import { fireEvent, render, screen } from '@testing-library/react';

import { PromoBanner } from './PromoBanner';

describe('PromoBanner', () => {
    it('renders the copy verbatim (newline included) and nothing optional by default', () => {
        const title = '나만의 클라우드에서 플레이스를\n만들고 함께 대화하세요!';
        render(<PromoBanner title={title} />);

        // The newline must survive into the DOM — `whitespace-pre-line` is what renders it as a
        // line break, so a collapsed-whitespace match here would hide a lost `\n`.
        expect(screen.getByText(title, { collapseWhitespace: false })).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders the action link only when both label and handler are given', () => {
        const { rerender } = render(<PromoBanner title="copy" actionLabel="클라우드 추가" />);
        expect(screen.queryByRole('button', { name: /클라우드 추가/ })).not.toBeInTheDocument();

        const onAction = jest.fn();
        rerender(<PromoBanner title="copy" actionLabel="클라우드 추가" onAction={onAction} />);

        fireEvent.click(screen.getByRole('button', { name: /클라우드 추가/ }));
        expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('renders the dismiss button only when onDismiss is given, at a 24px tap target', () => {
        const { rerender } = render(<PromoBanner title="copy" dismissLabel="닫기" />);
        expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();

        const onDismiss = jest.fn();
        rerender(<PromoBanner title="copy" onDismiss={onDismiss} dismissLabel="닫기" />);

        const dismiss = screen.getByRole('button', { name: '닫기' });
        // WCAG 2.5.8 minimum; the glyph itself is only 18px so the wrapper has to carry the size.
        expect(dismiss).toHaveClass('size-6');
        fireEvent.click(dismiss);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('renders the leading icon in its fixed 48px square when supplied', () => {
        render(<PromoBanner title="copy" icon={<img alt="cloud" src="/my-cloud.svg" />} />);

        expect(screen.getByAltText('cloud').parentElement).toHaveClass('size-12');
    });
});
