import type { TypeBody } from '@lemoncloud/lemon-boards-api';

export type CreateBoardTypeDTO = TypeBody;

export interface UpdateBoardTypeDTO extends Partial<CreateBoardTypeDTO> {
    boardTypeId: string;
}
