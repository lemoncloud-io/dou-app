import { useEffect, useRef } from 'react';

import { $createCodeNode, $isCodeNode } from '@lexical/code-core';
import { $isAutoLinkNode, createLinkMatcherWithRegExp } from '@lexical/link';
import { AutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $setBlocksType } from '@lexical/selection';
import { $findMatchingParent, mergeRegister } from '@lexical/utils';
import {
    $createParagraphNode,
    $getNodeByKey,
    $getRoot,
    $getNearestNodeFromDOMNode,
    $getSelection,
    $isLineBreakNode,
    $isParagraphNode,
    $isRangeSelection,
    $isTextNode,
    $insertNodes,
    COLLABORATION_TAG,
    COMMAND_PRIORITY_LOW,
    FORMAT_TEXT_COMMAND,
    HISTORIC_TAG,
    HISTORY_PUSH_TAG,
    KEY_ARROW_DOWN_COMMAND,
    KEY_DOWN_COMMAND,
    KEY_ENTER_COMMAND,
    type LexicalEditor,
    PASTE_COMMAND,
    PASTE_TAG,
    TextNode,
} from 'lexical';

import { LINK_URL_SOURCE, useComposerDraftStore } from '../../../../shared';
import { type FenceSegment, splitFences } from '../../utils';
import { $importWireMarkdown } from './wireMarkdown';

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

const FENCE = '```';

/**
 * Typing ``` on a line of its own opens a code block there and then, as in Slack. Lexical's own
 * shortcut waits for a space or a plain Enter after the fence, and only on a message's first line:
 * Enter sends here, so after Shift+Enter the fence stayed literal text and went out that way.
 *
 * Detected from the update, the way Lexical's markdown shortcuts are, not from keydown: what
 * matters is that one backtick was just added to a line that now reads exactly ```. That excludes a
 * draft or an edit loading (the text arrives whole) and undo/redo (tagged historic). The conversion
 * is its own history step, so ⌘Z brings the three backticks back.
 */
export const CodeFenceShortcutPlugin = () => {
    const [editor] = useLexicalComposerContext();

    useEffect(
        () =>
            mergeRegister(
                editor.registerUpdateListener(({ tags, dirtyLeaves, editorState, prevEditorState }) => {
                    if (tags.has(HISTORIC_TAG) || tags.has(COLLABORATION_TAG) || editor.isComposing()) return;
                    const key = editorState.read(() => {
                        const selection = $getSelection();
                        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
                        const node = selection.anchor.getNode();
                        if (!$isTextNode(node) || !dirtyLeaves.has(node.getKey())) return null;
                        if (node.getTextContent() !== FENCE || selection.anchor.offset !== FENCE.length) return null;
                        if (node.hasFormat('code') || !node.isSimpleText()) return null;
                        if (!$isParagraphNode(node.getParent())) return null;
                        // Alone on its line: ``` typed in front of a mention or other text is not a fence.
                        const before = node.getPreviousSibling();
                        if (before && !$isLineBreakNode(before)) return null;
                        const after = node.getNextSibling();
                        if (after && !$isLineBreakNode(after)) return null;
                        return node.getKey();
                    });
                    if (!key) return;
                    const grewByOne = prevEditorState.read(() => {
                        const previous = $getNodeByKey(key);
                        return $isTextNode(previous) && previous.getTextContent() === FENCE.slice(1);
                    });
                    if (!grewByOne) return;
                    editor.update(() => $openCodeBlockAt(key), { tag: HISTORY_PUSH_TAG });
                }),
                // Enter sends, so a code block at the end of the message has no keyboard way out
                // below it; ArrowDown on its last position makes the line after it.
                editor.registerCommand(
                    KEY_ARROW_DOWN_COMMAND,
                    event => {
                        const selection = $getSelection();
                        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
                        const code = selection.anchor.getNode().getTopLevelElement();
                        if (!$isCodeNode(code) || code.getNextSibling() !== null) return false;
                        const last = code.getLastDescendant();
                        const atEnd =
                            last === null || $isLineBreakNode(last)
                                ? selection.anchor.key === code.getKey() &&
                                  selection.anchor.offset === code.getChildrenSize()
                                : selection.anchor.key === last.getKey() &&
                                  selection.anchor.offset === last.getTextContentSize();
                        if (!atEnd) return false;
                        event?.preventDefault();
                        const after = $createParagraphNode();
                        code.insertAfter(after);
                        after.select();
                        return true;
                    },
                    COMMAND_PRIORITY_LOW
                )
            ),
        [editor]
    );
    return null;
};

/** Replaces the ``` text node `key` with an empty code block, keeping the lines around it as text. */
const $openCodeBlockAt = (key: string): void => {
    const fence = $getNodeByKey(key);
    const paragraph = fence?.getParent();
    if (!fence || !$isParagraphNode(paragraph)) return;

    const before = fence.getPreviousSibling();
    const rest = fence.getNextSiblings();
    // The line break that ended the fence's line goes with it, like the one before it.
    if ($isLineBreakNode(rest[0])) rest.shift()?.remove();
    if ($isLineBreakNode(before)) before.remove();
    fence.remove();

    const code = $createCodeNode();
    if (paragraph.isEmpty()) paragraph.replace(code);
    else paragraph.insertAfter(code);
    if (rest.length > 0) code.insertAfter($createParagraphNode().append(...rest));
    code.select();
};

/**
 * A plain-text paste that holds a fenced block — a command copied out of a message, a README or a
 * terminal note — goes in with the block as a code block and the rest as text, by the same rule
 * the message view reads fences with. Without this the fence went in as literal backticks, which
 * is how they came back out on send.
 *
 * Only plain text: a copy that carries HTML (a browser selection) goes through the editor's own
 * HTML import, which already turns `<pre>` into a code block. A paste inside a code block stays
 * raw, as code. Files never reach here — the composer takes those in the capture phase.
 */
export const CodeFencePastePlugin = () => {
    const [editor] = useLexicalComposerContext();

    useEffect(
        () =>
            editor.registerCommand(
                PASTE_COMMAND,
                event => {
                    const data = 'clipboardData' in event ? event.clipboardData : null;
                    if (!data || Array.from(data.types ?? []).includes('text/html')) return false;
                    const segments = splitFences(data.getData('text/plain'));
                    if (!segments.some(segment => segment.type === 'code')) return false;
                    const selection = $getSelection();
                    if (!$isRangeSelection(selection)) return false;
                    if ($isCodeNode(selection.anchor.getNode().getTopLevelElement())) return false;

                    event.preventDefault();
                    // Its own update, as the editor's paste does, so the change is reported and
                    // recorded like any other paste.
                    editor.update(() => $insertFenceSegments(segments), { tag: PASTE_TAG });
                    return true;
                },
                COMMAND_PRIORITY_LOW
            ),
        [editor]
    );
    return null;
};

/** Inserts pasted text at the caret, fenced parts as code blocks. */
const $insertFenceSegments = (segments: FenceSegment[]): void => {
    segments.forEach((segment, index) => {
        const caret = $getSelection();
        if (!$isRangeSelection(caret)) return;
        if (segment.type === 'text') {
            // The newline that set a block apart from its neighbours is the block's
            // own edge now; kept, it would leave an empty line beside the block.
            let text = segment.value;
            if (segments[index - 1]?.type === 'code') text = text.replace(/^\r?\n/, '');
            if (segments[index + 1]?.type === 'code') text = text.replace(/\r?\n$/, '');
            if (text) caret.insertRawText(text);
            return;
        }
        const code = $createCodeNode(segment.lang);
        $insertNodes([code]);
        if (segment.value) code.selectEnd().insertRawText(segment.value);
        // Leave the caret on the line after the block, making one if it is last.
        let next = code.getNextSibling();
        if (!$isParagraphNode(next)) {
            next = $createParagraphNode();
            code.insertAfter(next);
        }
        next.selectStart();
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
 * Load the channel's saved draft (the wire string) on
 * switch, then focus with the caret at the end.
 */
export const ChannelDraftPlugin = ({ channelId }: { channelId: string }) => {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        const draft = useComposerDraftStore.getState().drafts[channelId] ?? '';
        editor.update(() => {
            $importWireMarkdown(draft);
            $getRoot().selectEnd();
        });
        editor.focus();
    }, [editor, channelId]);
    return null;
};
