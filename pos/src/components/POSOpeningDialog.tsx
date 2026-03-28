import { RefreshCw, AlertTriangle, DoorClosed, X } from 'lucide-react';
import { Button } from './ui';
import { preparePOSClosingEntry, preparePOSOpeningEntry, checkPOSOpening } from '../lib/pos-opening-api';
import { useState, useEffect, useRef } from 'react';

export interface POSOpeningDialogProps {
  onReload: () => void;
  /** @deprecated Removed from UI — kept optional for compatibility */
  onContinue?: () => void;
  type: 'opening' | 'closing';
}

const POSOpeningDialog = ({ onReload, type }: POSOpeningDialogProps) => {
  const isOpeningIssue = type === 'opening';
  const [showFormModal, setShowFormModal] = useState(false);
  const [openingEntryName, setOpeningEntryName] = useState<string | null>(null);
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [closingEntryName, setClosingEntryName] = useState<string | null>(null);
  const [prepareLoading, setPrepareLoading] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const openingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentDomain = typeof window !== 'undefined' ? window.location.origin : '';

  const handleOpenOpeningEntry = async () => {
    setPrepareLoading(true);
    setPrepareError(null);
    try {
      const name = await preparePOSOpeningEntry();
      setOpeningEntryName(name);
      setShowFormModal(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to prepare opening entry.';
      setPrepareError(msg);
      setOpeningEntryName('new');
      setShowFormModal(true);
    } finally {
      setPrepareLoading(false);
    }
  };

  const handleOpenClosingEntry = async () => {
    setPrepareLoading(true);
    setPrepareError(null);
    try {
      const { name } = await preparePOSClosingEntry();
      setClosingEntryName(name);
      setShowClosingModal(true);
    } catch (err: unknown) {
      console.error('Failed to prepare POS closing entry', err);
      let msg = 'Could not prepare closing entry.';
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
      setPrepareError(msg);
      window.open(`${currentDomain}/app/pos-closing-entry`, '_blank');
    } finally {
      setPrepareLoading(false);
    }
  };

  const handleFormClose = () => {
    setShowFormModal(false);
    setOpeningEntryName(null);
    if (openingPollRef.current) clearInterval(openingPollRef.current);
    openingPollRef.current = null;
    onReload();
  };

  const handleClosingModalClose = () => {
    setShowClosingModal(false);
    setClosingEntryName(null);
    if (closingPollRef.current) clearInterval(closingPollRef.current);
    closingPollRef.current = null;
    onReload();
  };

  // Poll when opening entry iframe is shown: after submit, POS is open → reload
  useEffect(() => {
    if (!showFormModal) return;
    openingPollRef.current = setInterval(() => {
      checkPOSOpening()
        .then((res) => {
          if (res?.message !== 1) {
            if (openingPollRef.current) clearInterval(openingPollRef.current);
            openingPollRef.current = null;
            setShowFormModal(false);
            setOpeningEntryName(null);
            window.location.reload();
          }
        })
        .catch(() => {});
    }, 3000);
    return () => {
      if (openingPollRef.current) clearInterval(openingPollRef.current);
      openingPollRef.current = null;
    };
  }, [showFormModal]);

  // Poll when closing entry iframe is shown: after submit, POS not open → reload
  useEffect(() => {
    if (!showClosingModal) return;
    closingPollRef.current = setInterval(() => {
      checkPOSOpening()
        .then((res) => {
          if (res?.message === 1) {
            if (closingPollRef.current) clearInterval(closingPollRef.current);
            closingPollRef.current = null;
            setShowClosingModal(false);
            setClosingEntryName(null);
            window.location.reload();
          }
        })
        .catch(() => {});
    }, 3000);
    return () => {
      if (closingPollRef.current) clearInterval(closingPollRef.current);
      closingPollRef.current = null;
    };
  }, [showClosingModal]);

  // Opening entry iframe modal (same style as Close POS dialog). Use draft from API or new form.
  if (showFormModal && openingEntryName) {
    const formUrl =
      openingEntryName === 'new'
        ? `${currentDomain}/app/pos-opening-entry/new-pos-opening-entry`
        : `${currentDomain}/app/pos-opening-entry/${openingEntryName}`;
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50" onClick={handleFormClose}>
        <div className="flex flex-col bg-white rounded-lg shadow-xl w-[95vw] max-w-6xl h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 flex-shrink-0">
            <h2 className="text-xl font-semibold text-gray-900">POS Opening Entry</h2>
            <Button variant="outline" size="sm" onClick={handleFormClose}>
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
          </div>
          <iframe src={formUrl} title="POS Opening Entry Form" className="flex-1 w-full min-h-0 border-0" />
        </div>
      </div>
    );
  }

  // Closing entry iframe modal (when type is 'closing' and user clicked "Close the POS")
  if (showClosingModal && closingEntryName) {
    const closingUrl = `${currentDomain}/app/pos-closing-entry/${closingEntryName}`;
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50" onClick={handleClosingModalClose}>
        <div className="flex flex-col bg-white rounded-lg shadow-xl w-[95vw] max-w-6xl h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 flex-shrink-0">
            <h2 className="text-xl font-semibold text-gray-900">Close POS</h2>
            <Button variant="outline" size="sm" onClick={handleClosingModalClose}>
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
          </div>
          <iframe src={closingUrl} title="POS Closing Entry" className="flex-1 w-full min-h-0 border-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          {/* Icon */}
          <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-6 ${
            isOpeningIssue ? 'bg-red-100' : 'bg-orange-100'
          }`}>
            {isOpeningIssue ? (
              <RefreshCw className="h-8 w-8 text-red-600" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            )}
          </div>
          
          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {isOpeningIssue ? 'POS Not Opened' : 'Previous POS Not Closed'}
          </h2>
          
          {/* Message */}
          <p className="text-gray-600 mb-8 text-lg">
            {isOpeningIssue 
              ? 'Please open POS Entry to continue using the system.'
              : 'Please close the previous POS Entry to continue.'
            }
          </p>
          
          {/* Buttons */}
          <div className="space-y-3">
            <Button
              onClick={onReload}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Reload Page
            </Button>

            <Button
              onClick={isOpeningIssue ? handleOpenOpeningEntry : handleOpenClosingEntry}
              disabled={prepareLoading}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {!isOpeningIssue && <DoorClosed className="w-5 h-5" />}
              {prepareLoading ? 'Preparing...' : isOpeningIssue ? 'Open POS Opening Entry' : 'Close the POS'}
            </Button>
            {prepareError && (
              <p className="text-sm text-amber-600 mt-1">{prepareError} Opening new form in dialog.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default POSOpeningDialog; 