import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';

import { useCopyToClipboard } from '../../../shared';
import { useInviteLinkStore } from '../stores/useInviteLinkStore';

/**
 * Place-invite link display: the shareable link with a copy action. A place
 * invite has no waiting screen — the link itself is what the sender shares —
 * so the send flow lands here instead of the waiting dialog.
 */
export const PlaceInviteLinkDialog = () => {
    const { t } = useTranslation();
    const link = useInviteLinkStore(s => s.link);
    const close = useInviteLinkStore(s => s.close);
    const [copied, copyLink] = useCopyToClipboard();

    return (
        <Dialog open={link !== null} onOpenChange={open => !open && close()}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('invite.link.title')}</DialogTitle>
                <DialogDescription>{t('invite.link.subtitle')}</DialogDescription>
                <div className="flex items-center gap-2 pt-2">
                    <Input
                        readOnly
                        value={link ?? ''}
                        aria-label={t('invite.link.label')}
                        onFocus={e => e.target.select()}
                    />
                    <Button type="button" variant="outline" onClick={() => link && copyLink(link)}>
                        {copied ? t('invite.link.copied') : t('invite.link.copy')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
