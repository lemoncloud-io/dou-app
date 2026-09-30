import { useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { radioGroupOptions } from './radioGroup';

const OPTIONS = ['light', 'dark', 'system'] as const;

const Group = ({ initial }: { initial: string }) => {
    const [value, setValue] = useState<string>(initial);
    const optionProps = radioGroupOptions(OPTIONS, value, setValue);
    return (
        <>
            <button type="button">before</button>
            <div role="radiogroup" aria-label="Theme">
                {OPTIONS.map(option => (
                    <button key={option} type="button" {...optionProps(option)}>
                        {option}
                    </button>
                ))}
            </div>
        </>
    );
};

const radio = (name: string) => screen.getByRole('radio', { name });
const checked = () => screen.getAllByRole('radio').filter(r => r.getAttribute('aria-checked') === 'true');

describe('radioGroupOptions', () => {
    it('makes the checked option the one tab stop in the group', () => {
        render(<Group initial="dark" />);

        expect(radio('dark').tabIndex).toBe(0);
        expect(radio('light').tabIndex).toBe(-1);
        expect(radio('system').tabIndex).toBe(-1);
    });

    it('falls back to the first option as the tab stop when the value is not an option', () => {
        render(<Group initial="ko-KR" />);

        expect(radio('light').tabIndex).toBe(0);
        expect(checked()).toHaveLength(0);
    });

    it('moves focus and the check forward with ArrowRight and ArrowDown', () => {
        render(<Group initial="light" />);
        radio('light').focus();

        fireEvent.keyDown(radio('light'), { key: 'ArrowRight' });
        expect(document.activeElement).toBe(radio('dark'));
        expect(checked()).toEqual([radio('dark')]);

        fireEvent.keyDown(radio('dark'), { key: 'ArrowDown' });
        expect(document.activeElement).toBe(radio('system'));
        expect(checked()).toEqual([radio('system')]);
    });

    it('moves backward with ArrowLeft and ArrowUp, wrapping past either end', () => {
        render(<Group initial="light" />);
        radio('light').focus();

        fireEvent.keyDown(radio('light'), { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(radio('system'));
        expect(checked()).toEqual([radio('system')]);

        fireEvent.keyDown(radio('system'), { key: 'ArrowRight' });
        expect(document.activeElement).toBe(radio('light'));

        fireEvent.keyDown(radio('light'), { key: 'ArrowUp' });
        expect(document.activeElement).toBe(radio('system'));
    });

    it('jumps to the ends with Home and End', () => {
        render(<Group initial="dark" />);
        radio('dark').focus();

        fireEvent.keyDown(radio('dark'), { key: 'End' });
        expect(document.activeElement).toBe(radio('system'));
        fireEvent.keyDown(radio('system'), { key: 'Home' });
        expect(document.activeElement).toBe(radio('light'));
        expect(checked()).toEqual([radio('light')]);
    });

    it('leaves modified arrows and other keys alone', () => {
        render(<Group initial="light" />);
        radio('light').focus();

        fireEvent.keyDown(radio('light'), { key: 'ArrowRight', altKey: true, shiftKey: true });
        fireEvent.keyDown(radio('light'), { key: 'a' });

        expect(document.activeElement).toBe(radio('light'));
        expect(checked()).toEqual([radio('light')]);
    });

    it('still checks an option on click', () => {
        render(<Group initial="light" />);

        fireEvent.click(radio('system'));

        expect(checked()).toEqual([radio('system')]);
        expect(radio('system').tabIndex).toBe(0);
    });
});
