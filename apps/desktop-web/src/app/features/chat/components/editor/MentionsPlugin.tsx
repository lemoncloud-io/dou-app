import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin, MenuOption, type MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode } from 'lexical';

import { MENTION_TOKEN_SOURCE } from '../../../../shared';
import { MentionAutocomplete, type Mentionable } from '../MentionAutocomplete';
import { $createMentionNode } from './MentionNode';

class MentionTypeaheadOption extends MenuOption {
    constructor(readonly mentionable: Mentionable) {
        super(mentionable.id);
    }
}

// Word-start "@" + token chars up to the caret (same class RichText renders).
const MENTION_MATCH = new RegExp(`(^|[\\s([{])(@(${MENTION_TOKEN_SOURCE}*))$`, 'u');

const checkForMentionMatch = (text: string): MenuTextMatch | null => {
    const match = MENTION_MATCH.exec(text);
    if (!match) return null;
    return {
        leadOffset: match.index + match[1].length,
        matchingString: match[3],
        replaceableString: match[2],
    };
};

interface MentionsPluginProps {
    mentionables: Mentionable[];
}

/** "@"-typeahead: replaces the typed token with a MentionNode chip + a space. */
export const MentionsPlugin = ({ mentionables }: MentionsPluginProps) => {
    const [editor] = useLexicalComposerContext();
    const [query, setQuery] = useState<string | null>(null);

    // Every match is listed (the menu scrolls) — a silent cap reads as
    // "these are all the members" when it isn't.
    const options = useMemo(() => {
        const q = (query ?? '').toLowerCase();
        const matches = q ? mentionables.filter(m => m.name.toLowerCase().includes(q)) : mentionables;
        return matches.map(m => new MentionTypeaheadOption(m));
    }, [mentionables, query]);

    // Stable identity — the plugin re-registers its editor listener when this changes.
    const triggerFn = useCallback(
        (text: string) => (mentionables.length ? checkForMentionMatch(text) : null),
        [mentionables.length]
    );

    return (
        <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
            triggerFn={triggerFn}
            options={options}
            onQueryChange={setQuery}
            onSelectOption={(option, nodeToReplace, closeMenu) => {
                editor.update(() => {
                    const mentionNode = $createMentionNode(`@${option.mentionable.name}`);
                    if (nodeToReplace) nodeToReplace.replace(mentionNode);
                    const space = $createTextNode(' ');
                    mentionNode.insertAfter(space);
                    space.select();
                    closeMenu();
                });
            }}
            menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp }) =>
                anchorElementRef.current && options.length > 0
                    ? createPortal(
                          <MentionAutocomplete
                              items={options.map(o => o.mentionable)}
                              activeIndex={selectedIndex ?? 0}
                              onSelect={index => selectOptionAndCleanUp(options[index])}
                          />,
                          anchorElementRef.current
                      )
                    : null
            }
        />
    );
};
