import { useEffect, useRef } from 'react';

import { $createCodeNode, $isCodeNode } from '@lexical/code-core';
import { $isAutoLinkNode, createLinkMatcherWithRegExp } from '@lexical/link';
import { $convertFromMarkdownString } from '@lexical/markdown';
import { AutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $setBlocksType } from '@lexical/selection';
import { $findMatchingParent, mergeRegister } from '@lexical/utils';
import {
    $createParagraphNode,
    $getRoot,
    $getNearestNodeFromDOMNode,
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    COMMAND_PRIORITY_LOW,
    FORMAT_TEXT_COMMAND,
    KEY_DOWN_COMMAND,
    KEY_ENTER_COMMAND,
    type LexicalEditor,
    TextNode,
} from 'lexical';

import { LINK_URL_SOURCE, useComposerDraftStore } from '../../../../shared';
import { COMPOSER_TRANSFORMERS } from './editorConfig';

/** Toggle the selection's block between code block and paragraph. */
export const toggleCodeBlock = (editor: LexicalEditor): void => {
    editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const top = selection.anchor.getNode().getTopLevelElement();
        if ($isCodeNode(top)) $setBlocksType(selection, () => $createParagraphNode());
        else $setBlocksType(selection, () => $createCodeNode());
    });
};

// Module-level: AutoLinkPlugin re-registers whenever these arrays change identity.
const URL_MATCHERS = [createLinkMatcherWithRegExp(new RegExp(LINK_URL_SOURCE))];
const NOT_IN_CODE_BLOCK = [$isCodeNode];

/**
 * Marks a typed or pasted URL as a link while it is still in the composer,
 * Slack-style. Uses the same URL pattern RichText links, so the composer does not
 * show a link that arrives as plain text. Code is left alone because RichText
 * does not link inside it: code blocks are excluded as parents, and a URL in
 * inline code is kept as an unlinked AutoLinkNode (a plain span). Lexical's
 * matcher only sees text, not its format, so it cannot skip inline code itself.
 *
 * Clicking a link opens it in a new window, as in Slack — in the desktop shell
 * that hands it to the system browser. Lexical's ClickableLinkPlugin would also
 * open the unlinked inline-code ones (they are still link nodes), hence the
 * listener here. A click that ends a drag-selection only selects.
 */
export const ComposerAutoLinkPlugin = () => {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        const openLink = (event: MouseEvent) => {
            if (!(event.target instanceof Node)) return;
            const target = event.target;
            // `{ editor }` lets the DOM-to-node lookup run outside an update callback.
            const url = editor.getEditorState().read(
                () => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection) && !selection.isCollapsed()) return null;
                    const node = $getNearestNodeFromDOMNode(target);
                    const link = node && $findMatchingParent(node, $isAutoLinkNode);
                    return link && !link.getIsUnlinked() ? link.getURL() : null;
                },
                { editor }
            );
            if (!url) return;
            event.preventDefault();
            window.open(url, '_blank', 'noopener,noreferrer');
        };

        return mergeRegister(
            editor.registerNodeTransform(TextNode, text => {
                const link = text.getParent();
                if (!$isAutoLinkNode(link)) return;
                const inCode = link.getChildren().some(child => $isTextNode(child) && child.hasFormat('code'));
                if (link.getIsUnlinked() !== inCode) link.setIsUnlinked(inCode);
            }),
            editor.registerRootListener((root, prevRoot) => {
                prevRoot?.removeEventListener('click', openLink);
                root?.addEventListener('click', openLink);
            })
        );
    }, [editor]);

    return <AutoLinkPlugin matchers={URL_MATCHERS} excludeParents={NOT_IN_CODE_BLOCK} />;
};

/**
 * Enter sends, Shift+Enter breaks the line. Registered at LOW priority: the
 * mention typeahead (NORMAL) wins while its menu is open, the rich-text
 * default (EDITOR) only sees Shift+Enter.
 */
export const SubmitPlugin = ({ onSubmit }: { onSubmit: () => void }) => {
    const [editor] = useLexicalComposerContext();
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;

    useEffect(
        () =>
            editor.registerCommand(
                KEY_ENTER_COMMAND,
                event => {
                    if (!event || event.shiftKey) return false;
                    event.preventDefault();
                    // Mid-IME Enter (Hangul composition) commits the composition only —
                    // consume it without sending, like Slack.
                    if (!event.isComposing) onSubmitRef.current();
                    return true;
                },
                COMMAND_PRIORITY_LOW
            ),
        [editor]
    );
    return null;
};

/** ⌘B bold · ⌘I italic · ⌘⇧X strike · ⌘⇧C inline code · ⌘⇧⌥C code block. */
export const FormatShortcutsPlugin = () => {
    const [editor] = useLexicalComposerContext();

    useEffect(
        () =>
            editor.registerCommand(
                KEY_DOWN_COMMAND,
                event => {
                    // e.code (not e.key): macOS Option remaps e.key.
                    if (!(event.metaKey || event.ctrlKey)) return false;
                    // ⌘B / ⌘I — bound explicitly (preventDefault suppresses the
                    // browser's own beforeinput) instead of relying on Lexical's
                    // built-in, which the desktop shell doesn't fire reliably.
                    if (!event.shiftKey && !event.altKey) {
                        if (event.code === 'KeyB') {
                            event.preventDefault();
                            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
                            return true;
                        }
                        if (event.code === 'KeyI') {
                            event.preventDefault();
                            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
                            return true;
                        }
                        return false;
                    }
                    if (!event.shiftKey) return false;
                    if (event.code === 'KeyX' && !event.altKey) {
                        event.preventDefault();
                        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
                        return true;
                    }
                    if (event.code === 'KeyC') {
                        event.preventDefault();
                        if (event.altKey) toggleCodeBlock(editor);
                        else editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
                        return true;
                    }
                    return false;
                },
                COMMAND_PRIORITY_LOW
            ),
        [editor]
    );
    return null;
};

/**
 * Load the channel's saved draft (markdown, the store's existing format) on
 * switch, then focus with the caret at the end.
 */
export const ChannelDraftPlugin = ({ channelId }: { channelId: string }) => {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        const draft = useComposerDraftStore.getState().drafts[channelId] ?? '';
        editor.update(() => {
            $convertFromMarkdownString(draft, COMPOSER_TRANSFORMERS, undefined, true);
            $getRoot().selectEnd();
        });
        editor.focus();
    }, [editor, channelId]);
    return null;
};
