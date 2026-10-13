import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { MentionButton } from './MentionButton';

describe('MentionButton', () => {
    it('is named for what it does and says whether the list is showing', () => {
        const { rerender } = render(<MentionButton open={false} onClick={jest.fn()} />);
        const button = screen.getByRole('button', { name: 'chat.mention.open' });

        expect(button).toHaveAttribute('aria-haspopup', 'listbox');
        expect(button).toHaveAttribute('aria-expanded', 'false');

        rerender(<MentionButton open onClick={jest.fn()} />);
        expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('reports a tap', () => {
        const onClick = jest.fn();
        render(<MentionButton open={false} onClick={onClick} />);

        fireEvent.click(screen.getByRole('button'));

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('takes no tap while the composer is locked', () => {
        const onClick = jest.fn();
        render(<MentionButton open={false} onClick={onClick} disabled />);

        fireEvent.click(screen.getByRole('button'));

        expect(screen.getByRole('button')).toBeDisabled();
        expect(onClick).not.toHaveBeenCalled();
    });
});
