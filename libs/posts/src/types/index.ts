import type { PostView } from '@lemoncloud/lemon-boards-api';

export type CreatePostDTO = {
    boardId: string;
} & PostFormData;

export type UpdatePostDTO = {
    postId: string;
} & PostFormData;

export type PostFormData = Partial<PostView>;
