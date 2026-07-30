import { useAppUpdatePrompt } from '../hooks/useAppUpdatePrompt';
import { UpdatePromptDialog } from './UpdatePromptDialog';

/** Route-independent global host: mounted once at the app root (see app.tsx). */
export const AppUpdatePromptHost = () => {
    const { open, dismiss, goToStore } = useAppUpdatePrompt();

    return <UpdatePromptDialog open={open} onDismiss={dismiss} onUpdate={goToStore} />;
};
