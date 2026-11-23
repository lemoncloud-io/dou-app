import {
    $applyNodeReplacement,
    TextNode,
    type EditorConfig,
    type LexicalNode,
    type NodeKey,
    type SerializedTextNode,
    type Spread,
} from 'lexical';

import { MSG_MENTION_CLASS } from '@chatic/block-kit';

export class MentionNode extends TextNode {
    __picked?: PickedTarget;

    constructor(text: string, key?: NodeKey, target?: MentionTarget) {
        super(text, key);
        const who = target?.everyone ? { everyone: true as const } : target?.userId ? { userId: target.userId } : null;
        this.__picked = who ? { ...who, text } : undefined;
    }

    static override getType(): string {
        return 'mention';
    }

    static override clone(node: MentionNode): MentionNode {
        const clone = new MentionNode(node.__text, node.__key);
        clone.__picked = node.__picked;
        return clone;
    }

    static override importJSON(serialized: SerializedMentionNode): MentionNode {
        const { userId, everyone } = serialized;
        return $createMentionNode(serialized.text, { userId, everyone }).updateFromJSON(serialized);
    }

    override exportJSON(): SerializedMentionNode {
        const userId = this.getUserId();
        return {
            ...super.exportJSON(),
            type: 'mention',
            ...(userId ? { userId } : {}),
            ...(this.isEveryone() ? { everyone: true } : {}),
        };
    }

    private getPick(): PickedTarget | undefined {
        const { __picked: picked, __text: text } = this.getLatest();
        return picked?.text === text ? picked : undefined;
    }

    getUserId(): string | undefined {
        const pick = this.getPick();
        return pick && 'userId' in pick ? pick.userId : undefined;
    }

    isEveryone(): boolean {
        const pick = this.getPick();
        return !!pick && 'everyone' in pick;
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

type PickedTarget = ({ userId: string } | { everyone: true }) & { text: string };

export interface MentionTarget {
    userId?: string;
    everyone?: boolean;
}

type SerializedMentionNode = Spread<MentionTarget, SerializedTextNode>;

export const $createMentionNode = (text: string, target?: MentionTarget): MentionNode =>
    $applyNodeReplacement(new MentionNode(text, undefined, target).setMode('segmented').toggleDirectionless());

export const $isMentionNode = (node: LexicalNode | null | undefined): node is MentionNode =>
    node instanceof MentionNode;
