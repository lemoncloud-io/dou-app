import { useEffect, useRef } from 'react';

import { $createCodeNode, $isCodeNode } from '@lexical/code-core';
import { $isAutoLinkNode, createLinkMatcherWithRegExp, LinkNode } from '@lexical/link';
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
    $setSelection,
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

import {
    isLabelledLinkAddress,
    LINK_URL_SOURCE,
    useComposerDraftStore,
    useComposerFocusStore,
} from '../../../../shared';
import { type FenceSegment, splitFences } from '../../utils';
import { $importWireMarkdown } from './wireMarkdown';

export const toggleCodeBlock = (editor: LexicalEditor): void => {
    editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const top = selection.anchor.getNode().getTopLevelElement();
        if ($isCodeNode(top)) $setBlocksType(selection, () => $createParagraphNode());
        else $setBlocksType(selection, () => $createCodeNode());
    });
};

const URL_MATCHERS = [createLinkMatcherWithRegExp(new RegExp(LINK_URL_SOURCE))];
const NOT_IN_CODE_BLOCK = [$isCodeNode];

export const ComposerAutoLinkPlugin = () => {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        const openLink = (event: MouseEvent) => {
            if (!(event.target instanceof Node)) return;
            const target = event.target;
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

export const LinkGuardPlugin = () => {
    const [editor] = useLexicalComposerContext();
    useEffect(
        () =>
            editor.registerNodeTransform(LinkNode, node => {
                if ($isAutoLinkNode(node) || isLabelledLinkAddress(node.getURL())) return;
                for (const child of node.getChildren()) node.insertBefore(child);
                node.remove();
            }),
        [editor]
    );
    return null;
};

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

const $openCodeBlockAt = (key: string): void => {
    const fence = $getNodeByKey(key);
    const paragraph = fence?.getParent();
    if (!fence || !$isParagraphNode(paragraph)) return;

    const before = fence.getPreviousSibling();
    const rest = fence.getNextSiblings();
    if ($isLineBreakNode(rest[0])) rest.shift()?.remove();
    if ($isLineBreakNode(before)) before.remove();
    fence.remove();

    const code = $createCodeNode();
    if (paragraph.isEmpty()) paragraph.replace(code);
    else paragraph.insertAfter(code);
    if (rest.length > 0) code.insertAfter($createParagraphNode().append(...rest));
    code.select();
};

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
                    editor.update(() => $insertFenceSegments(segments), { tag: PASTE_TAG });
                    return true;
                },
                COMMAND_PRIORITY_LOW
            ),
        [editor]
    );
    return null;
};

const $insertFenceSegments = (segments: FenceSegment[]): void => {
    segments.forEach((segment, index) => {
        const caret = $getSelection();
        if (!$isRangeSelection(caret)) return;
        if (segment.type === 'text') {
            let text = segment.value;
            if (segments[index - 1]?.type === 'code') text = text.replace(/^\r?\n/, '');
            if (segments[index + 1]?.type === 'code') text = text.replace(/\r?\n$/, '');
            if (text) caret.insertRawText(text);
            return;
        }
        const code = $createCodeNode(segment.lang);
        $insertNodes([code]);
        if (segment.value) code.selectEnd().insertRawText(segment.value);
        let next = code.getNextSibling();
        if (!$isParagraphNode(next)) {
            next = $createParagraphNode();
            code.insertAfter(next);
        }
        next.selectStart();
    });
};

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
                    if (!event.isComposing) onSubmitRef.current();
                    return true;
                },
                COMMAND_PRIORITY_LOW
            ),
        [editor]
    );
    return null;
};

export const FormatShortcutsPlugin = () => {
    const [editor] = useLexicalComposerContext();

    useEffect(
        () =>
            editor.registerCommand(
                KEY_DOWN_COMMAND,
                event => {
                    if (!(event.metaKey || event.ctrlKey)) return false;
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

export const ChannelDraftPlugin = ({ channelId }: { channelId: string }) => {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        const draft = useComposerDraftStore.getState().drafts[channelId] ?? '';
        const skipped = useComposerFocusStore.getState().skipNext;
        const panel = document.activeElement?.closest('[data-trailing-panel]');
        const focus = !skipped && !(panel && !panel.contains(editor.getRootElement()));
        editor.update(() => {
            $importWireMarkdown(draft);
            if (focus) $getRoot().selectEnd();
            else $setSelection(null);
        });
        if (focus) editor.focus();
        else {
            const root = editor.getRootElement();
            root?.blur();
            requestAnimationFrame(() => root?.blur());
        }
    }, [editor, channelId]);
    return null;
};
