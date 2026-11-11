import { afterEach, describe, expect, it } from 'vitest';

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import i18n from '../../../../i18n';

import { ReadReceiptPill, type ReadPerson } from './ReadReceiptPill';

const person = (id: string, name: string): ReadPerson => ({ id, name });

const SUNNY = person('m0', 'Sunny');
const RAIN = person('m1', '레인');
const BOB = person('bob', 'Bob');
const AIDEN = person('m3', 'Aiden');
const CLAIRE = person('m4', 'Claire');

interface PillProps {
    faces?: ReadPerson[];
    readers?: ReadPerson[];
    nonReaders?: ReadPerson[];
}

const renderPill = ({ faces = [SUNNY, RAIN], readers = [SUNNY, RAIN], nonReaders = [BOB] }: PillProps = {}) =>
    render(<ReadReceiptPill faces={faces} readers={readers} nonReaders={nonReaders} />);

// The count is the button's accessible name, not text drawn beside the faces.
const pill = () => screen.getByRole('button', { name: /Seen/ });

afterEach(() => {
    cleanup();
    void i18n.changeLanguage('en');
});

describe('ReadReceiptPill', () => {
    describe('the faces', () => {
        it('draws the faces of the members at this spot, three at most, and counts the rest', () => {
            renderPill({ faces: [SUNNY, RAIN, BOB, AIDEN, CLAIRE] });

            expect(within(pill()).getByText('+2')).toBeDefined();
            expect(within(pill()).getByText('S')).toBeDefined();
            expect(within(pill()).getByText('레')).toBeDefined();
            expect(within(pill()).getByText('B')).toBeDefined();
            expect(within(pill()).queryByText('A')).toBeNull();
        });

        it('has no "+N" when three or fewer are at this spot', () => {
            renderPill({ faces: [SUNNY, RAIN, BOB] });

            expect(within(pill()).queryByText(/^\+/)).toBeNull();
        });

        it('draws no "Seen · Not seen" text, so a row carries faces and nothing else', () => {
            renderPill();

            expect(screen.queryByText(/Seen/)).toBeNull();
            expect(screen.queryByText(/Not seen/)).toBeNull();
        });
    });

    describe('the count', () => {
        it('is the button’s name, for a screen reader', () => {
            renderPill({ readers: [SUNNY, RAIN], nonReaders: [BOB] });

            expect(screen.getByRole('button', { name: 'Seen 2 · Not seen 1' })).toBeDefined();
        });

        it('drops the not-seen half once everyone has read it', () => {
            renderPill({ readers: [SUNNY, RAIN], nonReaders: [] });

            expect(screen.getByRole('button', { name: 'Seen 2' })).toBeDefined();
        });

        it('reads in Korean as the design does', async () => {
            await i18n.changeLanguage('ko');
            renderPill({ readers: [SUNNY, RAIN], nonReaders: [BOB] });

            expect(screen.getByRole('button', { name: '읽음 2 · 미확인 1' })).toBeDefined();
        });
    });

    describe('the counted pill (a thread)', () => {
        it('writes the counts out beside the readers’ faces', () => {
            render(<ReadReceiptPill faces={[SUNNY, RAIN]} readers={[SUNNY, RAIN]} nonReaders={[BOB]} counted />);

            expect(screen.getByText('Seen 2 · Not seen 1')).toBeDefined();
            expect(within(pill()).getByText('S')).toBeDefined();
        });

        it('writes the counts alone when nobody has read it yet', () => {
            render(<ReadReceiptPill faces={[]} readers={[]} nonReaders={[BOB]} counted />);

            expect(pill().textContent).toBe('Seen 0 · Not seen 1');
        });
    });

    describe('who read it', () => {
        it('lists who read it and who has not, a tab each, when the faces are clicked', async () => {
            renderPill();
            await act(async () => fireEvent.click(pill()));

            const popover = screen.getByRole('dialog');
            expect(within(popover).getByRole('tab', { name: 'Seen 2', selected: true })).toBeDefined();
            expect(within(popover).getByRole('tab', { name: 'Not seen 1' })).toBeDefined();
            expect(within(popover).getByText('Sunny')).toBeDefined();
            expect(within(popover).getByText('레인')).toBeDefined();
        });

        it('lists everyone who has read the message, not only those at this spot', async () => {
            renderPill({ faces: [SUNNY], readers: [SUNNY, RAIN, BOB], nonReaders: [] });
            await act(async () => fireEvent.click(pill()));

            const list = within(screen.getByRole('dialog')).getAllByRole('listitem');
            expect(list.map(item => item.textContent)).toEqual(['SSunny', '레레인', 'BBob']);
        });

        it('opens from the keyboard with focus inside, so the not-seen list can be reached', async () => {
            renderPill();
            await act(async () => fireEvent.click(pill(), { detail: 0 }));

            const popover = screen.getByRole('dialog');
            expect(popover.contains(document.activeElement)).toBe(true);
            await act(async () => within(popover).getByRole('tab', { name: 'Not seen 1' }).focus());

            expect(within(popover).getByRole('tab', { name: 'Not seen 1', selected: true })).toBeDefined();
            expect(within(popover).getByRole('tabpanel').textContent).toContain('Bob');
            expect(within(popover).getByRole('tabpanel').textContent).not.toContain('Sunny');
        });

        it('hands focus back to the faces when Escape closes a keyboard-opened list', async () => {
            renderPill();
            await act(async () => fireEvent.click(pill(), { detail: 0 }));
            await act(async () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }));

            expect(screen.queryByRole('dialog')).toBeNull();
            // Radix restores focus on the tick after the card unmounts.
            await waitFor(() => expect(document.activeElement).toBe(pill()));
        });

        it('leaves focus where the reader moved it when they leave a keyboard-opened list', async () => {
            renderPill();
            const elsewhere = document.body.appendChild(document.createElement('button'));
            try {
                await act(async () => fireEvent.click(pill(), { detail: 0 }));
                await act(async () => elsewhere.focus());
                await act(async () => new Promise(resolve => setTimeout(resolve, 0)));

                expect(screen.queryByRole('dialog')).toBeNull();
                expect(document.activeElement).toBe(elsewhere);
            } finally {
                elsewhere.remove();
            }
        });

        it('does not open on hover, so the pointer can travel to the Not seen tab and click it', async () => {
            renderPill();
            await act(async () => fireEvent.pointerEnter(pill()));
            expect(screen.queryByRole('dialog')).toBeNull();

            await act(async () => fireEvent.click(pill()));
            await act(async () => fireEvent.pointerLeave(pill()));
            const tab = within(screen.getByRole('dialog')).getByRole('tab', { name: 'Not seen 1' });
            await act(async () => fireEvent.mouseDown(tab, { button: 0 }));

            expect(within(screen.getByRole('dialog')).getByRole('tabpanel').textContent).toContain('Bob');
        });

        it('closes when the faces are clicked again', async () => {
            renderPill();
            await act(async () => fireEvent.click(pill()));
            await act(async () => fireEvent.click(pill()));

            expect(screen.queryByRole('dialog')).toBeNull();
        });
    });
});
