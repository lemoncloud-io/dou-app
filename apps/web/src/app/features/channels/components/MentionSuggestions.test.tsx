import '@testing-library/jest-dom';

import { createEvent, fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { MentionSuggestions } from './MentionSuggestions';
import { EVERYONE_MENTION, type MentionCandidate } from '../utils/mentionInput';

const EVERYONE: MentionCandidate = { id: '@everyone', label: EVERYONE_MENTION, everyone: true };
const MINSU: MentionCandidate = { id: 'u2', label: 'Minsu', thumbnail: 'https://example.test/minsu.png' };
const RAIN: MentionCandidate = { id: 'u3', label: '레인' };

describe('MentionSuggestions', () => {
    it('draws nothing for an empty list', () => {
        const { container } = render(<MentionSuggestions candidates={[]} onPick={jest.fn()} />);

        expect(container).toBeEmptyDOMElement();
    });

    it('lists the rows in order inside a labelled listbox, everyone with its hint', () => {
        render(<MentionSuggestions candidates={[EVERYONE, MINSU, RAIN]} onPick={jest.fn()} />);

        expect(screen.getByRole('listbox', { name: 'chat.mention.listLabel' })).toBeInTheDocument();
        const options = screen.getAllByRole('option');
        expect(options.map(option => option.textContent)).toEqual([
            `chat.mention.everyone@${EVERYONE_MENTION} · chat.mention.everyoneHint`,
            'Minsu',
            '레인',
        ]);
    });

    it('shows a member photo when there is one', () => {
        render(<MentionSuggestions candidates={[MINSU]} onPick={jest.fn()} />);

        expect(screen.getByRole('option').querySelector('img')).toHaveAttribute('src', MINSU.thumbnail);
    });

    it('reports the tapped row', () => {
        const onPick = jest.fn();
        render(<MentionSuggestions candidates={[EVERYONE, MINSU]} onPick={onPick} />);

        fireEvent.click(screen.getByRole('option', { name: /Minsu/ }));

        expect(onPick).toHaveBeenCalledWith(MINSU);
    });

    // A tap must not take focus off the composer's field, or the keyboard drops before the pick.
    it('cancels mousedown so the field keeps focus', () => {
        render(<MentionSuggestions candidates={[MINSU]} onPick={jest.fn()} />);
        const option = screen.getByRole('option');
        const event = createEvent.mouseDown(option);

        fireEvent(option, event);

        expect(event.defaultPrevented).toBe(true);
    });

    // On touch, cancelling pointerdown would also stop the list panning under the finger. jsdom has
    // no PointerEvent, so the type is hung on a plain event by hand; fireEvent answers false when a
    // listener cancelled it.
    it.each([
        ['mouse', false],
        ['touch', true],
    ])('lets a %s pointerdown through: %s', (pointerType, notCancelled) => {
        render(<MentionSuggestions candidates={[MINSU]} onPick={jest.fn()} />);
        const event = Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { pointerType });

        expect(fireEvent(screen.getByRole('option'), event)).toBe(notCancelled);
    });
});
