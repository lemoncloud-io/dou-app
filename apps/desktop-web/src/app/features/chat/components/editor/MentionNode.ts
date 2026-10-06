import { $applyNodeReplacement, TextNode, type EditorConfig, type LexicalNode, type SerializedTextNode } from 'lexical';

import { MSG_MENTION_CLASS } from '@chatic/block-kit';

/**
 * A picked @mention rendered as a chip inside the composer. Plain TextNode
 * subclass, so markdown serialization emits its literal text ("@name") — the
 * wire format stays what RichText renders. Segmented mode: backspace removes
 * the whole mention, matching Slack.
 */
export class MentionNode extends TextNode {
    static override getType(): string {
        return 'mention';
    }

    static override clone(node: MentionNode): MentionNode {
        return new MentionNode(node.__text, node.__key);
    }

    static override importJSON(serialized: SerializedTextNode): MentionNode {
        return $createMentionNode(serialized.text).updateFromJSON(serialized);
    }

    override exportJSON(): SerializedTextNode {
        return { ...super.exportJSON(), type: 'mention' };
    }

    override createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config);
        dom.className = MSG_MENTION_CLASS;
        return dom;
    }

    override isTextEntity(): true {
        return true;
    }

    override canInsertTextBefore(): boolean {
        return false;
    }

    override canInsertTextAfter(): boolean {
        return false;
    }
}

export const $createMentionNode = (text: string): MentionNode =>
    $applyNodeReplacement(new MentionNode(text).setMode('segmented').toggleDirectionless());

export const $isMentionNode = (node: LexicalNode | null | undefined): node is MentionNode =>
    node instanceof MentionNode;
