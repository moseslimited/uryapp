import React, { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '../components/ui';
import { formatCurrency } from '../lib/utils';
import { Spinner } from '../components/ui/spinner';
import { getProfitAndLoss, type ProfitAndLoss } from '../lib/accounting-api';
import { usePOSStore } from '../store/pos-store';

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ProfitLoss() {
  const posProfile = usePOSStore((s) => s.posProfile);
  const company = posProfile?.company ?? undefined;

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toYMD(d);
  });
  const [toDate, setToDate] = useState(() => toYMD(new Date()));
  const [data, setData] = useState<ProfitAndLoss | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getProfitAndLoss(fromDate, toDate, company)
      .then((d) => setData(d || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, company]);

  // Refetch when date range or company changes
  useEffect(() => {
    load();
  }, [load]);

  // Refetch when user returns to this tab/window (e.g. after making a sale on POS)
  useEffect(() => {
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <FileText className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Profit &amp; Loss</h1>
            <p className="text-sm text-gray-500">Income, expenses and net profit for the period</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          <span className="text-gray-500">to</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          <button type="button" onClick={load} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Update</button>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner message="Loading..." /></div>
        ) : data?.error ? (
          <p className="text-red-600 text-sm">{data.error}</p>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="bg-white">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Total Income</p>
                  <p className="text-xl font-semibold text-green-700">{formatCurrency(data.total_income ?? 0)}</p>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Total Expense</p>
                  <p className="text-xl font-semibold text-red-700">{formatCurrency(data.total_expense ?? 0)}</p>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Net Profit</p>
                  <p className={`text-xl font-semibold ${(data.net_profit ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(data.net_profit ?? 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {data.income && data.income.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Income</h2>
                <Card className="bg-white">
                  <CardContent className="p-3">
                    <ul className="space-y-1 text-sm">
                      {(data.income as Array<{ account_name?: string; account?: string; period?: number }>).slice(0, 15).map((row, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{row.account_name || row.account || '—'}</span>
                          <span>{formatCurrency(row.period ?? 0)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}

            {data.expense && data.expense.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Expense</h2>
                <Card className="bg-white">
                  <CardContent className="p-3">
                    <ul className="space-y-1 text-sm">
                      {(data.expense as Array<{ account_name?: string; account?: string; period?: number }>).slice(0, 15).map((row, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{row.account_name || row.account || '—'}</span>
                          <span>{formatCurrency(row.period ?? 0)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No data. Select dates and click Update.</p>
        )}
      </div>
    </div>
  );
}
