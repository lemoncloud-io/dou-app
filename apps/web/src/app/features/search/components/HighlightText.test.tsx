import '@testing-library/jest-dom';

import { render } from '@testing-library/react';

import { messageSearchText } from '../../channels/utils/messagePlainText';
import { HighlightText } from './HighlightText';

// A message row highlights inside the flattened body `useSearchContext` hands it, so the query has
// to be findable there once the markup is gone.
describe('HighlightText over a flattened message body', () => {
    const body = messageSearchText('[가이드](https://example.com/a) 참고\n```sh\nnx build web\nnx deploy web\n```');

    it('bolds a match on a code block line past the first', () => {
        const { container } = render(<HighlightText text={body} query="DEPLOY web" />);
        expect(container.querySelector('strong')).toHaveTextContent('deploy web');
    });

    it('bolds a match inside a labelled link by its words', () => {
        const { container } = render(<HighlightText text={body} query="가이드" />);
        expect(container.querySelector('strong')).toHaveTextContent('가이드');
    });

    // The scan matched the raw body, so a query on the link address finds the message; the row then
    // shows it without a highlight rather than printing the address back.
    it('shows the body unhighlighted when the query only matched markup', () => {
        const { container } = render(<HighlightText text={body} query="example.com" />);
        expect(container.querySelector('strong')).toBeNull();
        expect(container).toHaveTextContent('가이드 참고');
    });
});
