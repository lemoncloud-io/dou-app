import { afterEach, describe, expect, it } from 'vitest';

import { cleanup, render, screen } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';

import '../../../../i18n';
import { SystemNotice } from './SystemNotice';

const join = { stereo: 'system', subType: 'join', content: 'raw' } as DomainChat;

describe('SystemNotice', () => {
    afterEach(cleanup);

    it('renders grouped joins as one text line', () => {
        render(<SystemNotice chat={join} authorName="Ada" joinedNames={['Ada', 'Bo', 'Cy']} />);

        expect(screen.getByText('Ada joined along with Bo and Cy')).toBeTruthy();
        expect(document.querySelector('img, svg')).toBeNull();
    });

    it('renders two joins', () => {
        render(<SystemNotice chat={join} authorName="Ada" joinedNames={['Ada', 'Bo']} />);

        expect(screen.getByText('Ada joined along with Bo')).toBeTruthy();
    });

    it('collapses four or more into a count of others', () => {
        render(<SystemNotice chat={join} authorName="Ada" joinedNames={['Ada', 'Bo', 'Cy', 'Di', 'Ed']} />);

        expect(screen.getByText('Ada, Bo and 3 others joined')).toBeTruthy();
    });

    it('prints a single join as before', () => {
        render(<SystemNotice chat={join} authorName="Ada" />);

        expect(screen.getByText('Ada joined the channel')).toBeTruthy();
    });
});
