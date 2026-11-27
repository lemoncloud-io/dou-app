import { useState } from 'react';

import { logger } from '@chatic/bridges';
import { formatDate } from '@chatic/shared';
import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { Textarea } from '@chatic/ui-kit/components/ui/textarea';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import { useRefundSubscriptionByAdmin } from '../api/membershipsQuery';
import {
    describeRefundFailure,
    isRefundConfirmationValid,
    isRefundReasonValid,
    refundAvailability,
    refundEndpointFor,
} from '../lib/refund';
import { describeTargetServer, targetEndpointFor, type RelayStage } from '../lib/targetServer';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';
import type { JSX } from 'react';

interface RefundOutcome {
    status?: string;
    validUntil?: number;
}

interface RefundPanelProps {
    membership: MembershipView;
    stage: RelayStage;
}

export const RefundPanel = ({ membership, stage }: RefundPanelProps): JSX.Element => {
    const [confirming, setConfirming] = useState(false);
    const [reason, setReason] = useState('');
    const [typedUserId, setTypedUserId] = useState('');
    const [failure, setFailure] = useState<string | null>(null);
    const [refunded, setRefunded] = useState<RefundOutcome | null>(null);
    const { mutateAsync, isPending } = useRefundSubscriptionByAdmin();

    const userId = membership.userId ?? '';
    const endpoint = refundEndpointFor(targetEndpointFor(stage), stage);
    const target = describeTargetServer(endpoint);
    const availability = refundAvailability(membership, endpoint);
    const confirmed = isRefundConfirmationValid(stage, userId, typedUserId);
    const canSubmit = availability.enabled && isRefundReasonValid(reason) && confirmed && !isPending;

    const resetForm = () => {
        setReason('');
        setTypedUserId('');
    };

    const submit = async () => {
        if (!refundAvailability(membership, endpoint).enabled || !isRefundReasonValid(reason) || !confirmed) return;
        setFailure(null);
        try {
            const result = await mutateAsync({ userId, reason, endpoint });
            setRefunded(result ?? {});
            setConfirming(false);
            resetForm();
        } catch (error) {
            logger.error('GLOBAL', '[RefundPanel] admin refund failed', { error, userId });
            setFailure(describeRefundFailure(error));
        }
    };

    return (
        <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
                Refunds the last paid charge in full and expires the subscription immediately.
            </p>

            {refunded ? (
                <p className="text-xs text-emerald-400">
                    Refunded — subscription status is now {refunded.status ?? 'unknown'}
                    {refunded.validUntil ? `, ended ${formatDate(refunded.validUntil)}` : ''}. The list may show the old
                    row until the search index catches up.
                </p>
            ) : (
                availability.reason && <p className="text-xs text-amber-400">{availability.reason}</p>
            )}

            {failure && !confirming && <p className="text-destructive text-xs">{failure}</p>}

            <Button
                variant="destructive"
                className="w-full"
                disabled={!availability.enabled || isPending || !!refunded}
                onClick={() => {
                    setFailure(null);
                    setConfirming(true);
                }}
            >
                {isPending ? 'Refunding…' : 'Refund web subscription'}
            </Button>

            <AlertDialog
                open={confirming}
                onOpenChange={open => {
                    if (isPending) return;
                    setConfirming(open);
                    if (!open) resetForm();
                }}
            >
                <AlertDialogContent onEscapeKeyDown={event => isPending && event.preventDefault()}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Refund this web subscription?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                <ul className="list-disc space-y-1 pl-4 text-sm">
                                    <li>User: {userId}</li>
                                    <li>Product: {membership.productId || '-'}</li>
                                    <li>
                                        Valid until: {membership.validUntil ? formatDate(membership.validUntil) : '-'}
                                    </li>
                                    <li className="text-destructive">
                                        The charge is refunded in full and the subscription expires immediately. This
                                        cannot be undone.
                                    </li>
                                    <li>
                                        A trial or an unconfirmed first charge has nothing to refund; the server will
                                        refuse it.
                                    </li>
                                </ul>
                                <div className="flex items-center gap-1.5 pt-1">
                                    <span className="text-xs">Target server</span>
                                    <Badge variant={target.isProd ? 'destructive' : 'outline'}>{target.label}</Badge>
                                    <span className="text-muted-foreground font-mono text-xs">{target.endpoint}</span>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-1.5">
                        <Label htmlFor="refund-reason">Reason (required)</Label>
                        <Textarea
                            id="refund-reason"
                            value={reason}
                            onChange={event => setReason(event.target.value)}
                            placeholder="Why this subscription is being refunded"
                        />
                    </div>

                    {stage === 'v1' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="refund-confirm-user">Type the userId to refund on Production</Label>
                            <Input
                                id="refund-confirm-user"
                                value={typedUserId}
                                onChange={event => setTypedUserId(event.target.value)}
                                placeholder="userId"
                                autoComplete="off"
                            />
                        </div>
                    )}

                    {failure && <p className="text-destructive text-xs">The refund failed — {failure}</p>}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={!canSubmit}
                            onClick={event => {
                                event.preventDefault();
                                void submit();
                            }}
                        >
                            {isPending ? 'Refunding…' : 'Refund'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
