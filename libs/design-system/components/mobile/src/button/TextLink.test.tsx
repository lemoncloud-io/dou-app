import { fireEvent, render, screen } from '@testing-library/react';

import { TextLink } from './TextLink';

describe('TextLink', () => {
    it('renders the label and fires onClick', () => {
        const onClick = jest.fn();
        render(<TextLink onClick={onClick}>다음에 하기</TextLink>);
        fireEvent.click(screen.getByRole('button', { name: '다음에 하기' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not fire when disabled', () => {
        const onClick = jest.fn();
        render(
            <TextLink disabled onClick={onClick}>
                다음에 하기
            </TextLink>
        );
        fireEvent.click(screen.getByRole('button', { name: '다음에 하기' }));
        expect(onClick).not.toHaveBeenCalled();
    });
});
