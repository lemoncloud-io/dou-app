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

    // Callers hardcode one error id per dialog; two fields never share one.
    it('keeps two fields on their own error nodes', () => {
        render(
            <>
                <FormField label="Title" htmlFor="title" errorId="title-error" invalid>
                    <Input id="title" value="" onChange={() => undefined} />
                </FormField>
                <FormError id="title-error">Title it.</FormError>
                <FormField label="Body" htmlFor="body" errorId="body-error" invalid>
                    <Input id="body" value="" onChange={() => undefined} />
                </FormField>
                <FormError id="body-error">Describe it.</FormError>
            </>
        );

        expect(screen.getByLabelText('Title').getAttribute('aria-describedby')).toBe('title-error');
        expect(screen.getByLabelText('Body').getAttribute('aria-describedby')).toBe('body-error');
        expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
});
