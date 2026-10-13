import { describe, expect, it } from 'vitest';

import { isMentioned } from './mentionMatch';

describe('isMentioned', () => {
    it.each(['@channel', '@here', '@everyone', '@all', '@전체'])('reads %s as calling everyone', word => {
        expect(isMentioned(`${word} standup in 5`, ['Ada'])).toBe(true);
    });

    // `@all` starts many ordinary words and addresses; only the word on its own calls everyone.
    it('does not read a word or an address that merely starts with a group token', () => {
        expect(isMentioned('ping @Allison', ['Ada'])).toBe(false);
        expect(isMentioned('mail bob@allbirds.com', ['Ada'])).toBe(false);
        expect(isMentioned('see x@all', ['Ada'])).toBe(false);
        expect(isMentioned('@전체회의 공지', ['Ada'])).toBe(false);
    });

    it('reads a group token next to punctuation, in any case', () => {
        expect(isMentioned('(@all) heads up', ['Ada'])).toBe(true);
        expect(isMentioned('standup, @HERE.', ['Ada'])).toBe(true);
    });

    it('reads my own name', () => {
        expect(isMentioned('ping @ada', ['Ada'])).toBe(true);
    });

    it('does not read a message with no @ or no matching name', () => {
        expect(isMentioned('all hands at 3', ['Ada'])).toBe(false);
        expect(isMentioned('ping @Bo', ['Ada'])).toBe(false);
    });
});
