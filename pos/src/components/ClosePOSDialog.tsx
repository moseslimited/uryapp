import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui';
import { Spinner } from './ui/spinner';
import { preparePOSClosingEntry, checkPOSOpening } from '../lib/pos-opening-api';

interface ClosePOSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ClosePOSDialog({ open, onOpenChange }: ClosePOSDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closingEntryName, setClosingEntryName] = useState<string | null>(null);
  const [draftInvoicesRemaining, setDraftInvoicesRemaining] = useState(0);

  useEffect(() => {
    if (!open) {
      setError(null);
      setClosingEntryName(null);
      setDraftInvoicesRemaining(0);
      return;
    }
    setLoading(true);
    setError(null);
    setClosingEntryName(null);
    setDraftInvoicesRemaining(0);
    preparePOSClosingEntry()
      .then((res) => {
        setClosingEntryName(res.name);
        setDraftInvoicesRemaining(res.draftPosInvoicesRemaining);
      })
      .catch((err: unknown) => {
        let msg = 'Could not prepare POS closing entry.';
        if (err && typeof err === 'object') {
          const o = err as Record<string, unknown>;
          if (typeof o.exception === 'string') {
            msg = o.exception.replace(/^.*ValidationError:\s*/i, '').trim();
          } else if (typeof o._server_messages === 'string') {
            try {
              const arr = JSON.parse(o._server_messages) as Array<{ message?: string }>;
              if (arr?.[0]?.message) msg = arr[0].message;
            } catch {
              // keep default msg
            }
          } else if (err instanceof Error) {
            msg = err.message;
          }
        } else if (err instanceof Error) {
          msg = err.message;
        }
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const closingEntryUrl = closingEntryName ? `${baseUrl}/app/pos-closing-entry/${closingEntryName}` : null;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When closing entry iframe is shown, poll to detect submit; then reload so app shows "POS not opened"
  useEffect(() => {
    if (!open || !closingEntryUrl || loading || error) return;
    pollRef.current = setInterval(() => {
      checkPOSOpening()
        .then((res) => {
          if (res?.message === 1) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            onOpenChange(false);
            window.location.reload();
          }
        })
        .catch(() => {});
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [open, closingEntryUrl, loading, error, onOpenChange]);

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="default"
        size="7xl"
        className="!max-w-[95vw] !w-[95vw] !max-h-[90vh] flex flex-col p-0 min-h-[85vh]"
        onClose={handleClose}
        showCloseButton={true}
      >
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
          <DialogTitle>Close POS</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Review the day&apos;s summary, complete payment reconciliation, and submit to close the session.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col p-6">
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <Spinner message="Preparing closing entry..." />
            </div>
          )}

          {error && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <p className="text-red-600 font-medium">{error}</p>
              <p className="text-sm text-gray-500">
                If this persists, open POS Closing from ERPNext Desk or contact support.
              </p>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </div>
          )}

          {closingEntryUrl && !loading && !error && (
            <>
              {draftInvoicesRemaining > 0 && (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  <p className="font-medium">Pay Later orders (reference only)</p>
                  <p className="mt-1 text-blue-800/90">
                    {draftInvoicesRemaining} draft POS invoice(s) are on <strong>Pay Later</strong>. They are
                    listed in <strong>Open orders (draft / unpaid)</strong> on this form so you can see them, but
                    they are <strong>not</strong> added to POS Transactions or payment reconciliation totals.
                    Collect payment later from <strong>Orders</strong> or <strong>Parties</strong>. Orders in
                    the Unpaid tab (not Pay Later) must be paid or moved to Pay Later before you can submit this
                    closing.
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-600 max-w-[48rem]">
                    If this form looks broken (no styles, huge icons), the site is missing Desk CSS/JS
                    bundles — usually fixed by running{' '}
                    <code className="rounded bg-white px-1 py-0.5 text-[11px] border">bench build</code> on
                    the server, then hard-refresh. You can also complete closing in a full Desk tab.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      window.open(closingEntryUrl, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    Open in new tab
                  </Button>
                </div>
                <div className="flex-1 min-h-0 rounded-lg border border-gray-200 overflow-hidden">
                  <iframe
                    title="POS Closing Entry"
                    src={closingEntryUrl}
                    className="w-full h-full min-h-[70vh]"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
