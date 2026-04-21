import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './toast';
import { useToast } from './use-toast';

export const Toaster = () => {
    const { toasts } = useToast();

    return (
        <ToastProvider duration={1500} swipeDirection="up">
            {toasts.map(({ id, title, description, action, ...props }) => {
                return (
                    <Toast key={id} {...props}>
                        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                            {title && <ToastTitle>{title}</ToastTitle>}
                            {description && <ToastDescription>{description}</ToastDescription>}
                        </div>
                        {action}
                    </Toast>
                );
            })}
            <ToastViewport />
        </ToastProvider>
    );
};
