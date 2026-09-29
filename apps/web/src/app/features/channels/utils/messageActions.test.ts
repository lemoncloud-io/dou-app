import { canOpenMessageActions, hasMessageText } from './messageActions';

const upload$$ = [{ id: 'u1', status: 'stored', orgUrl: 'https://s3/1' }] as never;

describe('hasMessageText', () => {
    it('is true for a message with text', () => {
        expect(hasMessageText({ content: 'hello' })).toBe(true);
    });

    it('is false for an empty or whitespace-only body', () => {
        expect(hasMessageText({ content: '' })).toBe(false);
        expect(hasMessageText({ content: '  \n' })).toBe(false);
        expect(hasMessageText({})).toBe(false);
    });
});

describe('canOpenMessageActions', () => {
    it('opens for text, persisted or not — copy is always there', () => {
        expect(canOpenMessageActions({ content: 'hello', chatNo: 3 })).toBe(true);
        expect(canOpenMessageActions({ content: 'hello' })).toBe(true);
    });

    it('opens for a persisted image-only message', () => {
        expect(canOpenMessageActions({ content: '', upload$$, chatNo: 3 })).toBe(true);
    });

    it('stays shut for an image-only message still on its way, which has nothing to offer yet', () => {
        expect(canOpenMessageActions({ content: '', upload$$ })).toBe(false);
        expect(canOpenMessageActions({ content: '', upload$$, chatNo: 0 })).toBe(false);
    });

    it('stays shut for a message with neither text nor images', () => {
        expect(canOpenMessageActions({ content: '', chatNo: 3 })).toBe(false);
    });

    it('stays shut for a deleted message, whatever it carried', () => {
        expect(canOpenMessageActions({ content: 'hello', chatNo: 3, hidden: true })).toBe(false);
        expect(canOpenMessageActions({ content: '', upload$$, chatNo: 3, hidden: true })).toBe(false);
    });
});
