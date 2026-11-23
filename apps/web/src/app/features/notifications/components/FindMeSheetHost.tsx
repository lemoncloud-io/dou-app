import { useFindMeSheetRequest } from '../../../stores/useFindMeSheetRequest';
import { FindMeSheet } from './FindMeSheet';

export const FindMeSheetHost = () => {
    const open = useFindMeSheetRequest(state => state.open);
    const close = useFindMeSheetRequest(state => state.close);
    return <FindMeSheet open={open} onOpenChange={next => !next && close()} />;
};
