import { render, screen } from '@testing-library/react';

import { Button } from './Button';
import { ButtonGroup } from './ButtonGroup';

describe('ButtonGroup', () => {
    it('renders its button children side by side', () => {
        render(
            <ButtonGroup>
                <Button variant="outline">취소</Button>
                <Button>확인</Button>
            </ButtonGroup>
        );
        expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
    });
});
