import { fireEvent, render, screen } from '@testing-library/react';

import { ComposerLockButton } from './ComposerLockButton';

describe('ComposerLockButton', () => {
    it('is named for what a tap does and fires onClick', () => {
        const onClick = jest.fn();
        render(<ComposerLockButton onClick={onClick} label="입력 잠금 해제" />);

        fireEvent.click(screen.getByRole('button', { name: '입력 잠금 해제' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
