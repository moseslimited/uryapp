import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { formatCurrency } from '../lib/utils';
import { getPOSClosingEntriesList, type POSClosingEntryRow } from '../lib/reports-api';
import { usePOSStore } from '../store/pos-store';
import { Spinner } from '../components/ui/spinner';

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function DailyClosings() {
  const posProfile = usePOSStore((s) => s.posProfile);
  const branch = posProfile?.branch ?? undefined;
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toYMD(d);
  });
  const [toDate, setToDate] = useState(() => toYMD(new Date()));
  const [list, setList] = useState<POSClosingEntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getPOSClosingEntriesList(fromDate, toDate, branch, 100)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, branch]);

  useEffect(() => {
    load();
  }, [load]);

  const formatDate = (d: string) => (d ? new Date(d).toLocaleDateString() : '—');
  const formatDateTime = (s: string | null) => {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return formatDate(s);
    }
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const openInIframe = (name: string) => {
    setIframeUrl(`${baseUrl}/app/pos-closing-entry/${name}`);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CalendarCheck className="w-8 h-8 text-gray-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Daily closings</h1>
              <p className="text-sm text-gray-500">
                POS closing entries for your branch — quick overview of daily sales
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 flex justify-center">
            <Spinner message="Loading closing entries..." />
          </div>
        ) : list.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            No closing entries in this period. Close a POS session from the user menu to create one.
          </div>
        ) : (
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Closing</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Period</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">User</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600" title="Total quantity of items sold in this closing session">Items (qty)</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Net total</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Taxes</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Grand total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr
                    key={row.name}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-2 px-3">
                      <span className="font-medium text-gray-900">{row.name}</span>
                      <div className="text-xs text-gray-500">{formatDate(row.posting_date)}</div>
                    </td>
                    <td className="py-2 px-3 text-gray-600">
                      {formatDateTime(row.period_start_date)} – {formatDateTime(row.period_end_date)}
                    </td>
                    <td className="py-2 px-3 text-gray-700">{row.user || '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{row.total_quantity}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(row.net_total)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(row.total_taxes_and_charges)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">{formatCurrency(row.grand_total)}</td>
                    <td className="py-2 px-2">
                      <Button
                        variant="default"
                        size="sm"
                        className="text-xs bg-blue-900 text-white hover:bg-blue-950 hover:text-white border-0 shadow-sm"
                        onClick={() => openInIframe(row.name)}
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!iframeUrl} onOpenChange={(open) => !open && setIframeUrl(null)}>
        <DialogContent
          variant="default"
          size="7xl"
          className="!max-w-[95vw] !w-[95vw] !max-h-[90vh] flex flex-col p-0 min-h-[85vh]"
          onClose={() => setIframeUrl(null)}
        >
          <DialogHeader className="flex-shrink-0 px-4 py-2 border-b border-gray-200">
            <DialogTitle>POS Closing Entry</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-b-lg overflow-hidden">
            {iframeUrl && (
              <iframe
                title="POS Closing Entry"
                src={iframeUrl}
                className="w-full h-full min-h-[75vh] border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
