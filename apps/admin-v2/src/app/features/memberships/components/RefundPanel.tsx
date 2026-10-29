/**
 * `components/memberships/RefundPanel.tsx`
 * - The web subscription refund: one button, and the confirmation that stands between it and the relay.
 *
 * When the button may be pressed and how a refusal reads live in `lib/refund.ts`. This file collects
 * the reason and shows the outcome.
 *
 * The relay is resolved once, here, and that exact value is what the gate checks, what the dialog
 * names and what the call is sent to. A refund is irreversible, so "the server shown" and "the server
 * written to" must not be able to differ.
 */
import { useState } from 'react';

import { logger } from '@chatic/bridges';
import { formatDate } from '@chatic/shared';
import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Button } from '@chatic/ui-kit/components/ui/button';
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
import { describeRefundFailure, isRefundReasonValid, refundAvailability, refundEndpointFor } from '../lib/refund';
import { configuredEndpoint, describeTargetServer, type RelayStage } from '../lib/targetServer';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';
import type { JSX } from 'react';

/** What the panel reports back from the relay's response — the payments-side subscription. */
interface RefundOutcome {
    status?: string;
    validUntil?: number;
}

interface RefundPanelProps {
    membership: MembershipView;
    /** The stage the console is on. The refund resolves it to a relay itself — see the file comment. */
    stage: RelayStage;
}

export const RefundPanel = ({ membership, stage }: RefundPanelProps): JSX.Element => {
    const [confirming, setConfirming] = useState(false);
    const [reason, setReason] = useState('');
    const [failure, setFailure] = useState<string | null>(null);
    const [refunded, setRefunded] = useState<RefundOutcome | null>(null);
    const { mutateAsync, isPending } = useRefundSubscriptionByAdmin();

    const userId = membership.userId ?? '';
    const endpoint = refundEndpointFor(configuredEndpoint(), stage);
    const target = describeTargetServer(endpoint);
    const availability = refundAvailability(membership, endpoint);
    const canSubmit = availability.enabled && isRefundReasonValid(reason) && !isPending;

    const submit = async () => {
        // Re-checked at the moment of sending, not only when the button rendered.
        if (!refundAvailability(membership, endpoint).enabled || !isRefundReasonValid(reason)) return;
        setFailure(null);
        try {
            const result = await mutateAsync({ userId, reason, endpoint });
            setRefunded(result ?? {});
            setConfirming(false);
            setReason('');
        } catch (error) {
            logger.error('GLOBAL', '[RefundPanel] admin refund failed', { error, userId });
            setFailure(describeRefundFailure(error));
        }
    };

    return (
        <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
                Refunds the last paid charge in full and expires the subscription immediately. Development only.
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
                    // A cancelled reason must not sit there pre-filled, one click from firing.
                    if (!open) setReason('');
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
                                    {/* The membership view cannot tell a trial apart, so the relay decides. */}
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
