import React, { useEffect, useState } from 'react';
import { BookOpen, Wallet, TrendingUp, TrendingDown, ExternalLink, ArrowRightLeft } from 'lucide-react';
import { Button, Card, CardContent } from '../components/ui';
import { formatCurrency } from '../lib/utils';
import { Spinner } from '../components/ui/spinner';
import {
  getAccountsOverview,
  getCashBankAccounts,
  createTransferBetweenAccounts,
  type PeriodPreset,
  type AccountsOverview,
  type AccountOption,
} from '../lib/accounting-api';
import { showToast } from '../components/ui/toast';

const PERIODS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all', label: 'All' },
];

export default function Accounts() {
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [data, setData] = useState<AccountsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashBankAccounts, setCashBankAccounts] = useState<AccountOption[]>([]);
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRemark, setTransferRemark] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  useEffect(() => {
    setLoading(true);
    getAccountsOverview(period)
      .then((d) => setData(d || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    getCashBankAccounts()
      .then((list) => setCashBankAccounts(list ?? []))
      .catch(() => setCashBankAccounts([]));
  }, []);

  const handleTransfer = async () => {
    const amt = parseFloat(transferAmount);
    if (!transferFrom || !transferTo || !(amt > 0)) {
      showToast.error('Select From and To accounts and enter a valid amount.');
      return;
    }
    if (transferFrom === transferTo) {
      showToast.error('From and To accounts must be different.');
      return;
    }
    setTransferring(true);
    try {
      await createTransferBetweenAccounts({
        from_account: transferFrom,
        to_account: transferTo,
        amount: amt,
        remark: transferRemark || undefined,
      });
      showToast.success('Transfer recorded.');
      setTransferAmount('');
      setTransferRemark('');
      setShowTransfer(false);
      getAccountsOverview(period).then((d) => setData(d || null));
    } catch (e: unknown) {
      showToast.error(e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Transfer failed.');
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Accounts</h1>
              <p className="text-sm text-gray-500">Cash, Bank, Income &amp; Expense for selected period</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => window.open(`${window.location.origin}/app/account/view/tree`, '_blank')}
            className="flex items-center gap-1 shrink-0"
          >
            <ExternalLink className="w-4 h-4" /> Chart of accounts
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded text-sm ${period === p.value ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 pb-24">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner message="Loading..." /></div>
        ) : data?.error ? (
          <p className="text-red-600 text-sm">{data.error}</p>
        ) : data ? (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">{data.from_date} to {data.to_date}</p>

            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Wallet className="w-4 h-4" /> Cash &amp; Bank</h2>
                <Button variant="outline" size="sm" onClick={() => setShowTransfer(true)}>
                  <ArrowRightLeft className="w-4 h-4 mr-1" /> Move money
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.cash_bank?.map((acc) => (
                  <Card key={acc.account} className="bg-white">
                    <CardContent className="p-3">
                      <p className="text-xs text-gray-500">{acc.account_type}</p>
                      <p className="font-medium">{acc.account_name}</p>
                      <p className="text-lg">{formatCurrency(acc.balance ?? 0)}</p>
                    </CardContent>
                  </Card>
                ))}
                {(!data.cash_bank || data.cash_bank.length === 0) && <p className="text-gray-500 text-sm">No Cash/Bank accounts.</p>}
              </div>
            </section>

            {showTransfer && (
              <Card className="bg-white border-2 border-indigo-100">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4" /> Transfer between accounts
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">From (credit)</label>
                      <select
                        value={transferFrom}
                        onChange={(e) => setTransferFrom(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Select account</option>
                        {cashBankAccounts.map((a) => (
                          <option key={a.name} value={a.name}>{a.account_name || a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">To (debit)</label>
                      <select
                        value={transferTo}
                        onChange={(e) => setTransferTo(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Select account</option>
                        {cashBankAccounts.map((a) => (
                          <option key={a.name} value={a.name}>{a.account_name || a.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Amount</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        placeholder="0.00"
                        className="rounded border border-gray-300 px-3 py-2 text-sm w-32"
                      />
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-xs text-gray-500 mb-1">Remark (optional)</label>
                      <input
                        type="text"
                        value={transferRemark}
                        onChange={(e) => setTransferRemark(e.target.value)}
                        placeholder="e.g. Cash to bank"
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleTransfer} disabled={transferring}>
                      {transferring ? 'Recording…' : 'Record transfer'}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowTransfer(false); setTransferAmount(''); setTransferRemark(''); }}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Summary for period</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="bg-white">
                  <CardContent className="p-4 flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                    <div>
                      <p className="text-xs text-gray-500">Income</p>
                      <p className="text-xl font-semibold text-green-700">{formatCurrency(data.total_income ?? 0)}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white">
                  <CardContent className="p-4 flex items-center gap-2">
                    <TrendingDown className="w-6 h-6 text-red-600" />
                    <div>
                      <p className="text-xs text-gray-500">Expense</p>
                      <p className="text-xl font-semibold text-red-700">{formatCurrency(data.total_expense ?? 0)}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500">Net</p>
                    <p className={`text-xl font-semibold ${(data.net ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(data.net ?? 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No data.</p>
        )}
      </div>
    </div>
  );
}
