import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import i18n from '../../../../i18n';
import { StepDots } from './StepDots';

describe('StepDots', () => {
    afterEach(cleanup);

    it('draws one dot per step and marks only the current one', () => {
        render(<StepDots current={2} total={3} />);

        const dots = screen.getAllByRole('listitem');
        expect(dots).toHaveLength(3);
        expect(dots.map(dot => dot.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    });

    it('names the position for a screen reader instead of leaving three unlabelled dots', () => {
        render(<StepDots current={2} total={3} />);

        expect(
            screen.getByRole('list', { name: i18n.t('auth.progress', { current: 2, total: 3 }) })
        ).toBeTruthy();
    });
});
