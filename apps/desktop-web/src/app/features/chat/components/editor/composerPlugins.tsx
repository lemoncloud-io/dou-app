import { useEffect, useRef } from 'react';

import { $createCodeNode, $isCodeNode } from '@lexical/code';
import { $convertFromMarkdownString } from '@lexical/markdown';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $setBlocksType } from '@lexical/selection';
import {
    $createParagraphNode,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_LOW,
    FORMAT_TEXT_COMMAND,
    KEY_DOWN_COMMAND,
    KEY_ENTER_COMMAND,
    type LexicalEditor,
} from 'lexical';

import { useComposerDraftStore } from '../../../../shared';
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
                    // Mid-IME Enter (한글 조합) commits the composition only —
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

/** ⌘⇧X strike · ⌘⇧C inline code · ⌘⇧⌥C code block (⌘B/⌘I are built in). */
export const FormatShortcutsPlugin = () => {
    const [editor] = useLexicalComposerContext();

    useEffect(
        () =>
            editor.registerCommand(
                KEY_DOWN_COMMAND,
                event => {
                    // e.code (not e.key): macOS Option remaps e.key.
                    if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return false;
                    if (event.code === 'KeyX' && !event.altKey) {
                        event.preventDefault();
                        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
                        return true;
                    }
                    if (event.code === 'KeyC' && !event.altKey) {
                        event.preventDefault();
                        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
                        return true;
                    }
                    if (event.code === 'KeyC' && event.altKey) {
                        event.preventDefault();
                        toggleCodeBlock(editor);
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

/** Mirror the host's disabled flag into the editor. */
export const EditablePlugin = ({ disabled }: { disabled: boolean }) => {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        editor.setEditable(!disabled);
    }, [editor, disabled]);
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
