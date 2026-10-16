import { consoleText, dataPreview, lineSummary, localTime } from './logFormat';

describe('logFormat', () => {
    it('shows a console call as the page wrote it', () => {
        expect(consoleText(['[AUTH]', '[LoginPage] social login succeeded', { provider: 'google' }])).toBe(
            '[AUTH] [LoginPage] social login succeeded {"provider":"google"}'
        );
    });

    it('cuts a long preview and leaves none for a line without data', () => {
        expect(dataPreview({ text: 'x'.repeat(50) }, 20)).toHaveLength(20);
        expect(dataPreview({ text: 'x'.repeat(50) }, 20).endsWith('…')).toBe(true);
        expect(dataPreview(undefined)).toBe('');
    });

    it('summarises a console line by its text and any other line by its data', () => {
        const base = { seq: 1, at: new Date().toISOString() };
        expect(lineSummary({ ...base, source: 'console', type: 'warn', data: ['slow', 50] })).toBe('slow 50');
        expect(lineSummary({ ...base, source: 'web→shell', type: 'FetchCacheData', data: { type: 'chat' } })).toBe(
            '{"type":"chat"}'
        );
    });

    it('formats the time on the local clock', () => {
        const at = new Date(2026, 9, 16, 9, 5, 7, 42).toISOString();
        expect(localTime(at)).toBe('09:05:07.042');
    });
    it('applies a format string as the console does, dropping the styling', () => {
        expect(
            consoleText([
                '%c2026-10-16 %c[DEBUG] %cAWSCore',
                'color:DimGrey',
                'color:RoyalBlue',
                'color:Black',
                'extra',
            ])
        ).toBe('2026-10-16 [DEBUG] AWSCore extra');
        expect(consoleText(['loaded %s in %dms (100%%)', 'chat', 42])).toBe('loaded chat in 42ms (100%)');
    });
});
