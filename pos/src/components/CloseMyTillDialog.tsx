import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui';
import { Spinner } from './ui/spinner';
import { prepareSubPOSClosing } from '../lib/pos-opening-api';

interface CloseMyTillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CloseMyTillDialog({ open, onOpenChange }: CloseMyTillDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subClosingName, setSubClosingName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubClosingName(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSubClosingName(null);
    prepareSubPOSClosing()
      .then((name) => {
        setSubClosingName(name);
      })
      .catch((err: unknown) => {
        let msg = 'Could not prepare Sub POS Closing.';
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
  const subClosingUrl = subClosingName ? `${baseUrl}/app/sub-pos-closing/${subClosingName}` : null;

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
          <DialogTitle>Close my till</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Complete your till closing: review transactions, reconcile payments, and submit.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col p-6">
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <Spinner message="Preparing Sub POS Closing..." />
            </div>
          )}

          {error && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <p className="text-red-600 font-medium">{error}</p>
              <p className="text-sm text-gray-500">
                Submit or delete any draft invoices for your till, then try again.
              </p>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </div>
          )}

          {subClosingUrl && !loading && !error && (
            <div className="flex-1 min-h-0 rounded-lg border border-gray-200 overflow-hidden">
              <iframe
                title="Sub POS Closing"
                src={subClosingUrl}
                className="w-full h-full min-h-[70vh]"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
