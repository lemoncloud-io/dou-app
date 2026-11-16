import { useFindMeSheetRequest } from '../../../stores/useFindMeSheetRequest';
import { FindMeSheet } from './FindMeSheet';

/**
 * Answers home's request for the find-me sheet. Mounted by the private shell, because home may not
 * import this feature; it renders nothing until a request is raised.
 */
export const FindMeSheetHost = () => {
    const open = useFindMeSheetRequest(state => state.open);
    const close = useFindMeSheetRequest(state => state.close);
    return <FindMeSheet open={open} onOpenChange={next => !next && close()} />;
};
