import { useAppUpdatePrompt } from '../hooks/useAppUpdatePrompt';
import { UpdatePromptDialog } from './UpdatePromptDialog';

export const AppUpdatePromptHost = () => {
    const { open, dismiss, goToStore } = useAppUpdatePrompt();

    return <UpdatePromptDialog open={open} onDismiss={dismiss} onUpdate={goToStore} />;
};
