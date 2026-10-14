import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { render, screen } from '@testing-library/react';

import '../../../../i18n';

import { MentionAutocomplete, type Mentionable } from './MentionAutocomplete';

describe('MentionAutocomplete same-name members', () => {
    // jsdom lays nothing out: the list keeps its active row in view.
    const scrollIntoView = Element.prototype.scrollIntoView;
    beforeAll(() => {
        Element.prototype.scrollIntoView = () => undefined;
    });
    afterAll(() => {
        Element.prototype.scrollIntoView = scrollIntoView;
    });

const renderList = (items: Mentionable[]) =>
    render(<MentionAutocomplete items={items} activeIndex={0} onSelect={() => undefined} listId="test-list" />);

    const ada = (id: string, subName?: string): Mentionable => ({ id, name: 'Ada', subName });

    // The rows look identical; only a second line tells the two Adas apart.
    it('shows the profile name under each row when names collide', () => {
        renderList([ada('u-1', 'Ada Kim'), ada('u-2', 'Ada Lee')]);

        expect(screen.getByText('Ada Kim')).toBeTruthy();
        expect(screen.getByText('Ada Lee')).toBeTruthy();
    });

    it('shows no second line when names are unique', () => {
        renderList([{ id: 'u-1', name: 'Ada', subName: 'Ada Kim' }, { id: 'u-2', name: 'Bo' }]);

        expect(screen.queryByText('Ada Kim')).toBeNull();
    });
});
