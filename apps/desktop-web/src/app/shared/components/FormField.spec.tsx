import { describe, expect, it } from 'vitest';

import { render, screen } from '@testing-library/react';

import { Input } from '@chatic/ui-kit/components/ui/input';

import { FormError, FormField } from './FormField';

describe('FormField', () => {
    it('labels its field', () => {
        render(
            <FormField label="Nickname" htmlFor="nick">
                <Input id="nick" value="" onChange={() => undefined} />
            </FormField>
        );

        expect(screen.getByLabelText('Nickname')).toBeTruthy();
    });

    it('ties its error to the field when invalid', () => {
        render(
            <>
                <FormField label="Nickname" htmlFor="nick" errorId="nick-error" invalid>
                    <Input id="nick" value="" onChange={() => undefined} />
                </FormField>
                <FormError id="nick-error">Pick a nickname.</FormError>
            </>
        );

        const field = screen.getByLabelText('Nickname');
        expect(field.getAttribute('aria-invalid')).toBe('true');
        expect(field.getAttribute('aria-describedby')).toBe('nick-error');
        const error = screen.getByRole('alert');
        expect(error.getAttribute('id')).toBe('nick-error');
        expect(error.textContent).toBe('Pick a nickname.');
    });

    it('leaves a valid field alone', () => {
        render(
            <FormField label="Nickname" htmlFor="nick" errorId="nick-error">
                <Input id="nick" value="Kim" onChange={() => undefined} />
            </FormField>
        );

        const field = screen.getByLabelText('Nickname');
        expect(field.getAttribute('aria-invalid')).toBeNull();
        expect(field.getAttribute('aria-describedby')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
