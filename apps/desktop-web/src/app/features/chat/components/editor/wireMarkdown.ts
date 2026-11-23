import { $isCodeNode } from '@lexical/code-core';
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { $dfs } from '@lexical/utils';
import { $getRoot, $isTextNode, type TextNode } from 'lexical';

import type { ChatMentionBody } from '@chatic/runtime';

import { GROUP_MENTIONS, MENTION_TOKEN_SOURCE } from '../../../../shared';
import { WIRE_TRANSFORMERS } from './editorConfig';
import { $createMentionNode, $isMentionNode } from './MentionNode';

const FENCE = /^[ \t]*```/;

const mapOutsideFences = (text: string, fn: (line: string) => string): string => {
    let inFence = false;
    return text
        .split('\n')
        .map(line => {
            if (FENCE.test(line)) {
                inFence = !inFence;
                return line;
            }
            return inFence ? line : fn(line);
        })
        .join('\n');
};

const ESCAPED_BY_EXPORT = '*_`~';

const stripExportEscapes = (line: string): string => {
    let out = '';
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '\\' && next !== undefined && ESCAPED_BY_EXPORT.includes(next)) {
            out += next;
            i++;
        } else if (char === '`') {
            const close = line.indexOf('`', i + 1);
            const end = close === -1 ? line.length : close + 1;
            out += line.slice(i, end);
            i = end - 1;
        } else {
            out += char;
        }
    }
    return out;
};

const PLACEHOLDER_CANDIDATES = Array.from({ length: 16 }, (_, i) => String.fromCharCode(0xe000 + i));

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const $restoreMentions = (names: readonly string[]): void => {
    const listed = [...new Set([...names, ...GROUP_MENTIONS.map(group => group.slice(1))])]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    const pattern = new RegExp(
        `(?<![^\\s([{])@(?:${listed.map(escapeRegExp).join('|')})(?!${MENTION_TOKEN_SOURCE})`,
        'gu'
    );
    const candidates: TextNode[] = [];
    for (const { node } of $dfs()) {
        if (!$isTextNode(node) || !node.isSimpleText() || node.hasFormat('code')) continue;
        if ($isCodeNode(node.getParent())) continue;
        candidates.push(node);
    }
    for (const node of candidates) {
        const ranges = [...node.getTextContent().matchAll(pattern)].map(match => [
            match.index,
            match.index + match[0].length,
        ]);
        if (ranges.length === 0) continue;
        const size = node.getTextContentSize();
        const cuts = [...new Set(ranges.flat())].filter(at => at > 0 && at < size);
        const parts = cuts.length > 0 ? node.splitText(...cuts) : [node];
        const bounds = [0, ...cuts, size];
        parts.forEach((part, index) => {
            const isMention = ranges.some(([start, end]) => start === bounds[index] && end === bounds[index + 1]);
            if (isMention) part.replace($createMentionNode(part.getTextContent()).setFormat(part.getFormat()));
        });
    }
};

export const $importWireMarkdown = (wire: string, mentionNames?: readonly string[]): void => {
    const [backslash, ampersand] = PLACEHOLDER_CANDIDATES.filter(char => !wire.includes(char));
    if (backslash === undefined || ampersand === undefined) {
        throw new Error('wire string uses every placeholder character');
    }
    const guarded = wire.replace(/\\/g, backslash).replace(/&#/g, `${ampersand}#`);
    $convertFromMarkdownString(guarded, WIRE_TRANSFORMERS, undefined, true);
    for (const { node } of $dfs()) {
        if (!$isTextNode(node)) continue;
        const text = node.getTextContent();
        if (text.includes(backslash) || text.includes(ampersand)) {
            node.setTextContent(text.split(backslash).join('\\').split(ampersand).join('&'));
        }
    }
    if (mentionNames) $restoreMentions(mentionNames);
};

export const $collectMention = (): ChatMentionBody | undefined => {
    const userIds = new Set<string>();
    let all = false;
    for (const { node } of $dfs()) {
        if (!$isMentionNode(node)) continue;
        const userId = node.getUserId();
        if (userId) userIds.add(userId);
        if (node.isEveryone()) all = true;
    }
    if (userIds.size === 0 && !all) return undefined;
    return { ...(userIds.size > 0 ? { userIds: [...userIds] } : {}), ...(all ? { all: true } : {}) };
};

export const $exportWireMarkdown = (): string =>
    mapOutsideFences($convertToMarkdownString(WIRE_TRANSFORMERS, undefined, true), stripExportEscapes);

export const $hasMessageText = (): boolean => $getRoot().getTextContent().trim().length > 0;

export const $exportMessage = (): string => ($hasMessageText() ? $exportWireMarkdown().trim() : '');
