import type { BoardBody, BoardView } from '@lemoncloud/lemon-boards-api';
import type { BoardType } from '@lemoncloud/lemon-boards-api/dist/service/backend-types';

export type CreateBoardDTO = BoardBody;

export type UpdateBoardDTO = {
    boardId: string;
} & Partial<BoardFormData>;

export interface BoardFormData extends Partial<BoardView> {
    type: BoardType;
    title: string;
    maxImages: number;
    maxCommentDepth: number;
    categories: string[];
    isHidden: boolean;
    sortBy: string;
    reasons?: string[];
    feature$?: Record<string, boolean>;
    useBadage?: boolean;
    badgeColor?: string;
    badges?: string[];
    useMain?: boolean;
    isAnonymous: boolean;
}
