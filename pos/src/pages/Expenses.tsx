import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Plus, ChevronLeft, ChevronRight, Package, Users, ClipboardList } from 'lucide-react';
import { Button, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Select, SelectItem } from '../components/ui';
import { formatCurrency, getFrappeErrorMessage, cn } from '../lib/utils';
import { Spinner } from '../components/ui/spinner';
import { showToast } from '../components/ui/toast';
import { usePOSStore } from '../store/pos-store';
import {
  getExpenseAccounts,
  getCashBankAccounts,
  getEmployees,
  createExpenseEntry,
  getRecentExpenses,
  getSalaryPaymentsReport,
  EXPENSE_PAGE_SIZE,
  type AccountOption,
  type ExpenseRow,
  type SalaryPaymentsReport,
} from '../lib/accounting-api';
import { getWastageByReasonReport, type WastageByReasonSummary } from '../lib/reports-api';
import { getWastageReasons } from '../lib/wastage-api';

type ExpenseSection = 'salary' | 'wastage' | 'recent';

/** Start date (YYYY-MM-DD) from today minus whole calendar months. */
function startDateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const expenseNav: { id: ExpenseSection; label: string; hint: string; icon: React.ElementType }[] = [
  { id: 'recent', label: 'Recent expenses', hint: 'Journal entries from POS', icon: ClipboardList },
  { id: 'salary', label: 'Salary by employee', hint: 'Payroll totals in a period', icon: Users },
  { id: 'wastage', label: 'Wastage report', hint: 'Material issues by reason', icon: Package },
];

export default function Expenses() {
  const { posProfile } = usePOSStore();
  const company = posProfile?.company;

  const [expenseAccounts, setExpenseAccounts] = useState<AccountOption[]>([]);
  const [cashBankAccounts, setCashBankAccounts] = useState<AccountOption[]>([]);
  const [employees, setEmployees] = useState<Array<{ name: string; employee_name: string }>>([]);
  const [recent, setRecent] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expenseAccount, setExpenseAccount] = useState('');
  const [paidFrom, setPaidFrom] = useState('');
  const [employee, setEmployee] = useState('');
  const [amount, setAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [postingDate, setPostingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [salaryReport, setSalaryReport] = useState<SalaryPaymentsReport | null>(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [reportFrom, setReportFrom] = useState(() => startDateMonthsAgo(2));
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseListPage, setExpenseListPage] = useState(0);
  const [expenseListTotalCount, setExpenseListTotalCount] = useState<number | null>(null);
  const [expenseListTotalAmount, setExpenseListTotalAmount] = useState<number | null>(null);
  const [filterByExpenseAccount, setFilterByExpenseAccount] = useState<string>('__all__');
  const [wastageFrom, setWastageFrom] = useState(() => startDateMonthsAgo(2));
  const [wastageTo, setWastageTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [wastageReasonFilter, setWastageReasonFilter] = useState<string>('__all__');
  const [wastageReport, setWastageReport] = useState<{
    by_reason: WastageByReasonSummary[];
    total_wastage_amount: number;
  } | null>(null);
  const [wastageReasons, setWastageReasons] = useState<Array<{ value: string; label: string }>>([]);
  const [wastageLoading, setWastageLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<ExpenseSection>('recent');

  const isSalaryAccount = (accountName: string) => (accountName || '').toLowerCase().includes('salary');
  const selectedExpenseAccount = expenseAccounts.find((a) => a.name === expenseAccount);
  const showEmployeeField = Boolean(selectedExpenseAccount && isSalaryAccount(selectedExpenseAccount.account_name || selectedExpenseAccount.name));

  const load = () => {
    setLoading(true);
    Promise.all([
      getExpenseAccounts(company),
      getCashBankAccounts(company),
      getRecentExpenses(expenseListPage, undefined, undefined, filterByExpenseAccount && filterByExpenseAccount !== '__all__' ? filterByExpenseAccount : undefined),
    ])
      .then(([exp, cash, rec]) => {
        setExpenseAccounts(exp);
        setCashBankAccounts(cash);
        setRecent(rec.items || []);
        setExpenseListTotalCount(rec.total_count ?? null);
        setExpenseListTotalAmount(rec.total_amount ?? null);
        if (exp.length && !expenseAccount) setExpenseAccount(exp[0].name);
        if (cash.length && !paidFrom) setPaidFrom(cash[0].name);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadEmployees = () => {
    getEmployees(company).then(setEmployees).catch(() => setEmployees([]));
  };

  useEffect(() => {
    setExpenseListPage(0);
  }, [filterByExpenseAccount]);
  useEffect(() => {
    load();
  }, [company, expenseListPage, filterByExpenseAccount]);

  useEffect(() => {
    if (showAdd && showEmployeeField && employees.length === 0) loadEmployees();
  }, [showAdd, showEmployeeField]);

  useEffect(() => {
    if (!showEmployeeField) setEmployee('');
  }, [showEmployeeField]);

  useEffect(() => {
    getWastageReasons().then(setWastageReasons).catch(() => setWastageReasons([]));
  }, []);

  const pageExpenseSubtotal = useMemo(
    () => recent.reduce((sum, r) => sum + (Number(r.total_debit) || 0), 0),
    [recent]
  );

  const expenseTotalPages =
    expenseListTotalCount != null && expenseListTotalCount > 0
      ? Math.max(1, Math.ceil(expenseListTotalCount / EXPENSE_PAGE_SIZE))
      : null;

  const canGoNextExpense =
    expenseListTotalCount != null
      ? (expenseListPage + 1) * EXPENSE_PAGE_SIZE < expenseListTotalCount
      : recent.length >= EXPENSE_PAGE_SIZE && recent.length > 0;

  const fetchSalaryReport = useCallback(() => {
    if (!company) return Promise.resolve();
    setSalaryLoading(true);
    return getSalaryPaymentsReport(reportFrom, reportTo, company)
      .then((r) => setSalaryReport(r ?? null))
      .catch(() => setSalaryReport(null))
      .finally(() => setSalaryLoading(false));
  }, [company, reportFrom, reportTo]);

  useEffect(() => {
    if (activeSection !== 'salary' || !company) return;
    fetchSalaryReport();
  }, [activeSection, company, fetchSalaryReport]);

  const fetchWastageReport = useCallback(() => {
    setWastageLoading(true);
    return getWastageByReasonReport(
      wastageFrom,
      wastageTo,
      wastageReasonFilter && wastageReasonFilter !== '__all__' ? wastageReasonFilter : undefined
    )
      .then((r) => setWastageReport({ by_reason: r.by_reason, total_wastage_amount: r.total_wastage_amount ?? 0 }))
      .catch(() => setWastageReport(null))
      .finally(() => setWastageLoading(false));
  }, [wastageFrom, wastageTo, wastageReasonFilter]);

  useEffect(() => {
    if (activeSection !== 'wastage') return;
    fetchWastageReport();
  }, [activeSection, fetchWastageReport]);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!expenseAccount || !paidFrom || Number.isNaN(amt) || amt <= 0) {
      showToast.error('Select accounts and enter amount');
      return;
    }
    setSubmitting(true);
    try {
      const res = await createExpenseEntry({
        expense_account: expenseAccount,
        amount: amt,
        paid_from_account: paidFrom,
        posting_date: postingDate,
        remark: remark || undefined,
        employee: showEmployeeField && employee ? employee : undefined,
      });
      setShowAdd(false);
      setAmount('');
      setRemark('');
      setEmployee('');
      showToast.success('Expense saved successfully.');
      const newName = res?.journal_entry;
      if (newName) {
        setRecent((prev) => [{ name: newName, posting_date: postingDate, total_debit: amt, user_remark: remark || '' }, ...prev]);
      }
      getRecentExpenses(0, undefined, undefined, filterByExpenseAccount && filterByExpenseAccount !== '__all__' ? filterByExpenseAccount : undefined)
        .then((rec) => {
          setRecent(rec.items || []);
          setExpenseListTotalCount(rec.total_count ?? null);
          setExpenseListTotalAmount(rec.total_amount ?? null);
          setExpenseListPage(0);
        })
        .catch(() => {});
    } catch (e: unknown) {
      showToast.error(getFrappeErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-8 h-8 text-green-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
              <p className="text-sm text-gray-500">Record salaries, daily expenses — linked to Erp</p>
            </div>
          </div>
          <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" /> Add expense</Button>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner message="Loading..." /></div>
        ) : (
          <div className="grid grid-cols-12 gap-4 max-w-[1600px] mx-auto">
            <aside className="col-span-12 lg:col-span-3 xl:col-span-2">
              <Card className="bg-white border-gray-200 lg:sticky lg:top-4 shadow-sm">
                <CardContent className="p-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-2 mb-2">
                    Expense navigator
                  </h2>
                  <div className="space-y-1">
                    {expenseNav.map((nav) => {
                      const Icon = nav.icon;
                      const selected = activeSection === nav.id;
                      return (
                        <button
                          key={nav.id}
                          type="button"
                          onClick={() => setActiveSection(nav.id)}
                          className={cn(
                            'w-full text-left rounded-lg px-3 py-2 transition-colors border cursor-pointer',
                            selected
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={cn('w-4 h-4', selected ? 'text-blue-600' : 'text-gray-500')} />
                            <span className={cn('text-sm font-medium', selected ? 'text-blue-900' : 'text-gray-800')}>
                              {nav.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 ml-6">{nav.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </aside>

            <div className="col-span-12 lg:col-span-9 xl:col-span-10 space-y-6">
            {activeSection === 'salary' && (
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/90">
                <h2 className="text-sm font-semibold text-gray-900">Salary payments by employee</h2>
                <p className="text-xs text-gray-500 mt-0.5">Uses journal entries tagged with employee on salary expense accounts.</p>
              </div>
              <div className="p-4">
              <p className="text-xs text-gray-500 mb-3">
                Default period is the <strong>last two months</strong> through today. Change the dates and use <strong>View report</strong> to refresh.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="h-9 w-auto" />
                <span className="text-gray-500">to</span>
                <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="h-9 w-auto" />
                <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => fetchSalaryReport()} disabled={salaryLoading || !company}>
                  {salaryLoading ? 'Loading…' : 'View report'}
                </Button>
              </div>
              {salaryLoading ? (
                <div className="py-12 flex justify-center">
                  <Spinner message="Loading salary report…" />
                </div>
              ) : !salaryReport ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center text-sm text-gray-500">
                  No data loaded. Check that a company is set on your POS profile, then try <strong>View report</strong>.
                </div>
              ) : (
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-800">
                    Total paid to employees: {formatCurrency(salaryReport.total_amount)}
                  </div>
                  <div className="p-3">
                    {salaryReport.by_employee.length === 0 ? (
                      <p className="text-gray-500 text-sm">No salary payments with employee selected in this period.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-gray-600">
                              <th className="py-2 pr-3 font-medium">Employee</th>
                              <th className="py-2 pr-3 font-medium text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salaryReport.by_employee.map((row, i) => (
                              <tr key={row.employee} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                                <td className="py-2 pr-3">{row.employee_name || row.employee}</td>
                                <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatCurrency(row.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>
            </section>
            )}

            {activeSection === 'wastage' && (
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/90">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600" />
                Wastage / Material issues
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Record wastage from the <strong>Wastage</strong> tab. Below: summary by reason for the period.
              </p>
              </div>
              <div className="p-4">
              <p className="text-xs text-gray-500 mb-3">
                Default period is the <strong>last two months</strong>. The report loads when you open this section; adjust filters and use <strong>View report</strong> to refresh.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Input type="date" value={wastageFrom} onChange={(e) => setWastageFrom(e.target.value)} className="h-9 w-auto" />
                <span className="text-gray-500">to</span>
                <Input type="date" value={wastageTo} onChange={(e) => setWastageTo(e.target.value)} className="h-9 w-auto" />
                <label className="text-sm text-gray-600">Reason:</label>
                <Select value={wastageReasonFilter} onValueChange={setWastageReasonFilter} className="w-44">
                  <SelectItem value="__all__">All reasons</SelectItem>
                  {wastageReasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </Select>
                <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => fetchWastageReport()} disabled={wastageLoading}>
                  {wastageLoading ? 'Loading…' : 'View report'}
                </Button>
              </div>
              {wastageLoading ? (
                <div className="py-12 flex justify-center">
                  <Spinner message="Loading wastage report…" />
                </div>
              ) : !wastageReport ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center text-sm text-gray-500">
                  Could not load wastage data. Try <strong>View report</strong> again.
                </div>
              ) : (
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  <div className="px-3 py-2 bg-amber-50/80 border-b border-amber-100/80 text-sm font-medium text-amber-950">
                    Total wastage (period): {formatCurrency(wastageReport.total_wastage_amount)}
                  </div>
                  <div className="p-3">
                    {wastageReport.by_reason.length === 0 ? (
                      <p className="text-gray-500 text-sm">No wastage entries with reason in this period.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left bg-gray-50">
                              <th className="py-2 px-2 font-medium text-gray-700">Reason</th>
                              <th className="py-2 px-2 font-medium text-gray-700 text-right">Entries</th>
                              <th className="py-2 px-2 font-medium text-gray-700 text-right">Qty</th>
                              <th className="py-2 px-2 font-medium text-gray-700 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wastageReport.by_reason.map((row, i) => (
                              <tr key={row.reason} className={i % 2 === 0 ? 'bg-white border-b border-gray-100' : 'bg-gray-50/50 border-b border-gray-100'}>
                                <td className="py-2 px-2">{row.reason}</td>
                                <td className="py-2 px-2 text-right">{row.entries ?? 0}</td>
                                <td className="py-2 px-2 text-right">{Number(row.total_qty ?? 0).toLocaleString()}</td>
                                <td className="py-2 px-2 text-right font-medium">{formatCurrency(row.total_amount ?? 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>
            </section>
            )}

            {activeSection === 'recent' && (
            <section className="mb-2">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/90">
                  <h2 className="text-sm font-semibold text-gray-900">Recent expenses</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Journal entries created from this POS (newest first).</p>
                </div>
              <Card className="bg-white border-0 shadow-none rounded-none overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="expense-account-filter" className="text-sm text-gray-600 whitespace-nowrap">
                      Filter by account
                    </label>
                    <Select
                      id="expense-account-filter"
                      value={filterByExpenseAccount}
                      onValueChange={setFilterByExpenseAccount}
                      placeholder="All accounts"
                      className="w-[min(100%,14rem)]"
                    >
                      <SelectItem value="__all__">All accounts</SelectItem>
                      {expenseAccounts.map((a) => (
                        <SelectItem key={a.name} value={a.name}>
                          {a.account_name || a.name}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {recent.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-gray-500 border-b border-gray-100">
                      No expenses in this list yet. Use <strong>Add expense</strong> above or change the account filter.
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-gray-700">
                          <th className="py-2.5 px-4 font-medium">Date</th>
                          <th className="py-2.5 px-4 font-medium">Journal entry</th>
                          <th className="py-2.5 px-4 font-medium">Remark</th>
                          <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((r, idx) => (
                          <tr
                            key={r.name}
                            className={idx % 2 === 0 ? 'bg-white border-b border-gray-100' : 'bg-gray-50/60 border-b border-gray-100'}
                          >
                            <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{r.posting_date}</td>
                            <td className="py-2.5 px-4 font-medium text-gray-900">{r.name}</td>
                            <td className="py-2.5 px-4 text-gray-600 max-w-[12rem] sm:max-w-md truncate" title={r.user_remark || ''}>
                              {r.user_remark || '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-medium tabular-nums">{formatCurrency(r.total_debit ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="px-4 py-3 bg-gray-50/90 border-t border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-700 space-y-0.5 order-2 sm:order-1">
                    {filterByExpenseAccount !== '__all__' && expenseListTotalAmount != null ? (
                      <p>
                        <span className="text-gray-500">Total ({expenseAccounts.find((a) => a.name === filterByExpenseAccount)?.account_name || 'filter'}): </span>
                        <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(expenseListTotalAmount)}</span>
                        {expenseListTotalCount != null && (
                          <span className="text-gray-500 font-normal"> · {expenseListTotalCount} entr{expenseListTotalCount === 1 ? 'y' : 'ies'}</span>
                        )}
                      </p>
                    ) : (
                      <p>
                        <span className="text-gray-500">Subtotal (this page): </span>
                        <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(pageExpenseSubtotal)}</span>
                        {filterByExpenseAccount === '__all__' && (
                          <span className="text-gray-500 text-xs block sm:inline sm:ml-1">Pick an account filter for a period total.</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2 order-1 sm:order-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={expenseListPage === 0}
                      onClick={() => setExpenseListPage((p) => Math.max(0, p - 1))}
                      className={`min-w-[7.5rem] ${expenseListPage === 0 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <ChevronLeft className="w-4 h-4 mr-0.5" aria-hidden />
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600 tabular-nums px-1 min-w-[7rem] text-center">
                      Page {expenseListPage + 1}
                      {expenseTotalPages != null ? ` of ${expenseTotalPages}` : ''}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canGoNextExpense}
                      onClick={() => setExpenseListPage((p) => p + 1)}
                      className={`min-w-[7.5rem] ${!canGoNextExpense ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-0.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              </Card>
              </div>
            </section>
            )}
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent size="sm" className="sm:max-w-md" onClose={() => setShowAdd(false)} showCloseButton={true}>
            <DialogHeader className="p-4 pb-2 text-left sm:text-left">
              <DialogTitle className="text-lg font-semibold text-gray-900">Record expense</DialogTitle>
            </DialogHeader>
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Expense account</label>
                <Select
                  value={expenseAccount}
                  onValueChange={setExpenseAccount}
                  placeholder={expenseAccounts.length ? 'e.g. Salaries, Office' : 'Loading…'}
                  disabled={!expenseAccounts.length}
                >
                  {expenseAccounts.map((a) => (
                    <SelectItem key={a.name} value={a.name}>
                      {a.account_name || a.name}
                    </SelectItem>
                  ))}
                </Select>
                {!loading && !expenseAccounts.length && (
                  <p className="text-xs text-amber-600 mt-1">No expense accounts. Set up Chart of Accounts in Erp.</p>
                )}
              </div>
              {showEmployeeField && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Employee being paid</label>
                  <Select
                    value={employee}
                    onValueChange={setEmployee}
                    placeholder={employees.length ? 'Select employee' : 'Loading employees…'}
                    disabled={!employees.length}
                  >
                    {employees.map((emp) => (
                      <SelectItem key={emp.name} value={emp.name}>
                        {emp.employee_name || emp.name}
                      </SelectItem>
                    ))}
                  </Select>
                  {employees.length === 0 && !loading && (
                    <p className="text-xs text-amber-600 mt-1">No employees found. Add employees in Erp.</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pay from</label>
                <Select
                  value={paidFrom}
                  onValueChange={setPaidFrom}
                  placeholder={cashBankAccounts.length ? 'Cash or Bank account' : 'Loading…'}
                  disabled={!cashBankAccounts.length}
                >
                  {cashBankAccounts.map((a) => (
                    <SelectItem key={a.name} value={a.name}>
                      {a.account_name || a.name}
                    </SelectItem>
                  ))}
                </Select>
                {!loading && !cashBankAccounts.length && (
                  <p className="text-xs text-amber-600 mt-1">No cash/bank accounts. Add in Chart of Accounts.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount</label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-10" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
                <Input type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Remark (optional)</label>
                <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. Salaries March" className="h-10" />
              </div>
            </div>
            <DialogFooter className="p-4 pt-2 flex flex-row justify-end gap-2 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
