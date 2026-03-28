import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart3,
  Receipt,
  TrendingUp,
  TrendingDown,
  Clock,
  CreditCard,
  AlertTriangle,
  Calendar,
  Package,
  Trash2,
  Users,
  Table as TableIcon,
} from 'lucide-react';
import { Button, Card, CardContent } from '../components/ui';
import { formatCurrency } from '../lib/utils';
import { Spinner } from '../components/ui/spinner';
import { usePOSStore } from '../store/pos-store';
import {
  getReportTodaySummary,
  getReportDaywiseSales,
  getReportItemWiseSales,
  getReportTimeWiseSales,
  getReportLowStock,
  getReportPaymentSummary,
  getProductionSaleVarianceReport,
  getWastageByReasonReport,
  getReportSalesByStaff,
  getReportTableOccupancy,
  type TodaySummary,
  type DaywiseRow,
  type ItemWiseRow,
  type TimeWiseRow,
  type LowStockRow,
  type PaymentSummaryRow,
  type ProductionSaleVarianceRow,
  type WastageByReasonSummary,
  type StaffPerformanceRow,
  type TableOccupancyRow,
} from '../lib/reports-api';
import { getProfitabilityByItem, getItemsProfitAndSalesRankings, type ProfitabilityRow, type ItemsProfitAndSalesRankings, type ItemProfitSalesRow } from '../lib/accounting-api';
import { cn } from '../lib/utils';

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

export type PeriodPreset = 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'custom';
type ReportView =
  | 'overview'
  | 'sales_trend'
  | 'profitability'
  | 'item_sales'
  | 'time_sales'
  | 'payments'
  | 'staff'
  | 'tables'
  | 'variance'
  | 'wastage'
  | 'low_stock';

function getPeriodRange(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const today = toYMD(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'this_week') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return { from: toYMD(d), to: today };
  }
  if (preset === 'this_month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toYMD(d), to: today };
  }
  if (preset === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    const d = new Date(now.getFullYear(), (q - 1) * 3, 1);
    return { from: toYMD(d), to: today };
  }
  return { from: today, to: today };
}

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'custom', label: 'Custom' },
];

export default function Reports() {
  const posProfile = usePOSStore((s) => s.posProfile);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [daywise, setDaywise] = useState<DaywiseRow[]>([]);
  const [itemwise, setItemwise] = useState<ItemWiseRow[]>([]);
  const [itemSortBy, setItemSortBy] = useState<'both' | 'qty' | 'sales'>('both');
  const [timewise, setTimewise] = useState<TimeWiseRow[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [payments, setPayments] = useState<PaymentSummaryRow[]>([]);
  const [variance, setVariance] = useState<ProductionSaleVarianceRow[]>([]);
  const [wastageByReason, setWastageByReason] = useState<WastageByReasonSummary[]>([]);
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformanceRow[]>([]);
  const [tableOccupancy, setTableOccupancy] = useState<TableOccupancyRow[]>([]);
  const [profitability, setProfitability] = useState<ProfitabilityRow[]>([]);
  const [rankings, setRankings] = useState<ItemsProfitAndSalesRankings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<ReportView>('overview');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_week');
  const [fromDate, setFromDate] = useState(() => getPeriodRange('this_week').from);
  const [toDate, setToDate] = useState(() => getPeriodRange('this_week').to);
  const [timewiseDate, setTimewiseDate] = useState(() => toYMD(new Date()));

  const effectiveFrom = periodPreset === 'custom' ? fromDate : getPeriodRange(periodPreset).from;
  const effectiveTo = periodPreset === 'custom' ? toDate : getPeriodRange(periodPreset).to;

  const branch = posProfile?.branch;

  const loadReports = async () => {
    setLoading(true);
    const from = effectiveFrom;
    const to = effectiveTo;
    try {
      const [t, dw, iw, tw, low, pay, varList, wastageRes, staffList, tableList, profList, rankList] = await Promise.all([
        getReportTodaySummary(branch),
        getReportDaywiseSales(from, to, branch),
        getReportItemWiseSales(from, to, 25, branch, itemSortBy),
        getReportTimeWiseSales(timewiseDate, branch),
        posProfile?.name ? getReportLowStock(posProfile.name) : Promise.resolve([]),
        getReportPaymentSummary(from, to, branch),
        getProductionSaleVarianceReport(from, to, branch, posProfile?.name),
        getWastageByReasonReport(from, to),
        getReportSalesByStaff(from, to, branch),
        getReportTableOccupancy(from, to, branch),
        getProfitabilityByItem(from, to, 50),
        getItemsProfitAndSalesRankings(from, to, undefined, branch, 10),
      ]);
      setToday(t);
      setDaywise(dw);
      setItemwise(iw);
      setTimewise(tw);
      setLowStock(low);
      setPayments(pay);
      setVariance(Array.isArray(varList) ? varList : []);
      setWastageByReason(Array.isArray(wastageRes?.by_reason) ? wastageRes.by_reason : []);
      setStaffPerformance(Array.isArray(staffList) ? staffList : []);
      setTableOccupancy(Array.isArray(tableList) ? tableList : []);
      setProfitability(Array.isArray(profList) ? profList : []);
      setRankings(rankList ?? null);
    } catch (e) {
      console.error('Reports load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (periodPreset !== 'custom') {
      const { from, to } = getPeriodRange(periodPreset);
      setFromDate(from);
      setToDate(to);
    }
  }, [periodPreset]);

  useEffect(() => {
    loadReports();
  }, [effectiveFrom, effectiveTo, timewiseDate, posProfile?.name, itemSortBy]);

  const maxDayTotal = daywise.length ? Math.max(...daywise.map((r) => r.grand_total), 1) : 1;
  const maxTimeSales = timewise.length ? Math.max(...timewise.map((r) => r.sales), 1) : 1;
  const reportNav: { id: ReportView; label: string; icon: React.ElementType; hint: string }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3, hint: 'Summary + top highlights' },
    { id: 'sales_trend', label: 'Sales Trend', icon: TrendingUp, hint: 'Daily movement' },
    { id: 'profitability', label: 'Profitability', icon: TrendingDown, hint: 'Margin by item' },
    { id: 'item_sales', label: 'Top Items', icon: Package, hint: 'Item qty and amount' },
    { id: 'time_sales', label: 'Sales by Time', icon: Clock, hint: 'Hourly performance' },
    { id: 'payments', label: 'Payments', icon: CreditCard, hint: 'Mode split' },
    { id: 'staff', label: 'Staff Sales', icon: Users, hint: 'Waiter/cashier totals' },
    { id: 'tables', label: 'Table Occupancy', icon: TableIcon, hint: 'Turn metrics' },
    { id: 'variance', label: 'Production Variance', icon: Package, hint: 'Produced vs sold' },
    { id: 'wastage', label: 'Wastage', icon: Trash2, hint: 'Reason analysis' },
    { id: 'low_stock', label: 'Low Stock', icon: AlertTriangle, hint: 'Reorder alerts' },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-gray-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-500">Sales, items, and stock at a glance</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24 space-y-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner message="Loading reports..." />
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            <aside className="col-span-12 lg:col-span-3 xl:col-span-2">
              <Card className="bg-white border-gray-200 lg:sticky lg:top-4">
                <CardContent className="p-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-2 mb-2">
                    Report Navigator
                  </h2>
                  <div className="space-y-1">
                    {reportNav.map((nav) => {
                      const Icon = nav.icon;
                      const selected = activeReport === nav.id;
                      return (
                        <button
                          key={nav.id}
                          type="button"
                          onClick={() => setActiveReport(nav.id)}
                          className={cn(
                            'w-full text-left rounded-lg px-3 py-2 transition-colors border',
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
              <section className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Calendar className="w-4 h-4" />
                    Period
                  </span>
                  <select
                    value={periodPreset}
                    onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
                    className="rounded border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    {PERIOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {periodPreset === 'custom' && (
                    <>
                      <label className="flex items-center gap-2 text-sm text-gray-600">
                        From
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-600">
                        To
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                      </label>
                    </>
                  )}
                  {periodPreset !== 'custom' && (
                    <span className="text-sm text-gray-500">
                      {effectiveFrom} - {effectiveTo}
                    </span>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={loadReports}>
                  Refresh reports
                </Button>
              </section>
            {/* Highest & lowest profit / Top & bottom by quantity (date from period) */}
            {rankings && activeReport === 'overview' && (
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Highest & lowest profit · Top & bottom by quantity sold
                </h2>
                <p className="text-xs text-gray-500 mb-2">Uses selected period dates. Profit: BOM unit cost vs selling price; non-BOM: last purchase vs selling.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card className="bg-gray-50 border-gray-200">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Highest profit</h3>
                      </div>
                      <ul className="space-y-1">
                        {(rankings.highest_profit || []).slice(0, 5).map((r: ItemProfitSalesRow, i: number) => (
                          <li key={r.item_code} className="flex justify-between items-baseline gap-2 text-sm">
                            <span className="truncate" title={r.item_name}>{i + 1}. {r.item_name || r.item_code}</span>
                            <span className="text-gray-600 font-medium shrink-0">{formatCurrency(r.margin)} ({r.margin_percent}%)</span>
                          </li>
                        ))}
                        {(!rankings.highest_profit || rankings.highest_profit.length === 0) && <li className="text-xs text-gray-500">No data</li>}
                      </ul>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-50 border-gray-200">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingDown className="w-4 h-4 text-amber-600" />
                        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Lowest profit</h3>
                      </div>
                      <ul className="space-y-1">
                        {(rankings.lowest_profit || []).slice(0, 5).map((r: ItemProfitSalesRow, i: number) => (
                          <li key={r.item_code} className="flex justify-between items-baseline gap-2 text-sm">
                            <span className="truncate" title={r.item_name}>{i + 1}. {r.item_name || r.item_code}</span>
                            <span className="text-gray-600 font-medium shrink-0">{formatCurrency(r.margin)} ({r.margin_percent}%)</span>
                          </li>
                        ))}
                        {(!rankings.lowest_profit || rankings.lowest_profit.length === 0) && <li className="text-xs text-gray-500">No data</li>}
                      </ul>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-50 border-gray-200">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <BarChart3 className="w-4 h-4 text-blue-600" />
                        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Highest selling (qty)</h3>
                      </div>
                      <ul className="space-y-1">
                        {(rankings.highest_qty_sold || []).slice(0, 5).map((r: ItemProfitSalesRow, i: number) => (
                          <li key={r.item_code} className="flex justify-between items-baseline gap-2 text-sm">
                            <span className="truncate" title={r.item_name}>{i + 1}. {r.item_name || r.item_code}</span>
                            <span className="text-gray-600 font-medium shrink-0">{r.qty}</span>
                          </li>
                        ))}
                        {(!rankings.highest_qty_sold || rankings.highest_qty_sold.length === 0) && <li className="text-xs text-gray-500">No data</li>}
                      </ul>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-50 border-gray-200">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <BarChart3 className="w-4 h-4 text-gray-500" />
                        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Lowest selling (qty)</h3>
                      </div>
                      <ul className="space-y-1">
                        {(rankings.lowest_qty_sold || []).slice(0, 5).map((r: ItemProfitSalesRow, i: number) => (
                          <li key={r.item_code} className="flex justify-between items-baseline gap-2 text-sm">
                            <span className="truncate" title={r.item_name}>{i + 1}. {r.item_name || r.item_code}</span>
                            <span className="text-gray-600 font-medium shrink-0">{r.qty}</span>
                          </li>
                        ))}
                        {(!rankings.lowest_qty_sold || rankings.lowest_qty_sold.length === 0) && <li className="text-xs text-gray-500">No data</li>}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}

            {/* Today's summary / End of day */}
            {activeReport === 'overview' && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Today / End of day summary
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Receipt className="w-4 h-4" />
                      <span className="text-xs font-medium">Invoices</span>
                    </div>
                    <p className="mt-1 text-xl font-bold text-gray-900">{today?.total_invoices ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="bg-white">
                  <CardContent className="p-4">
                    <div className="text-xs font-medium text-gray-500">Net total</div>
                    <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">
                      {today != null ? formatCurrency(today.net_total) : '—'}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-white">
                  <CardContent className="p-4">
                    <div className="text-xs font-medium text-gray-500">Taxes</div>
                    <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">
                      {today != null ? formatCurrency(today.taxes) : '—'}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-white">
                  <CardContent className="p-4">
                    <div className="text-xs font-medium text-gray-500">Grand total</div>
                    <p className="mt-1 text-xl font-bold text-green-700 tabular-nums">
                      {today != null ? formatCurrency(today.grand_total) : '—'}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>
            )}

            {/* Sales trend (daywise) */}
            {activeReport === 'sales_trend' && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Sales trend</h2>
              <Card className="bg-white overflow-hidden">
                <CardContent className="p-4">
                  {daywise.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4">No sales in this period.</p>
                  ) : (
                    <div className="space-y-2">
                      {daywise.map((r) => (
                        <div key={r.date} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-24 shrink-0">{r.date}</span>
                          <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded min-w-[2px] transition-all"
                              style={{ width: `${(r.grand_total / maxDayTotal) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-900 tabular-nums w-24 text-right">
                            {formatCurrency(r.grand_total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            )}

            {/* Profitability by item (all sold items) */}
            {activeReport === 'profitability' && profitability.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Profitability by item (all sold items)</h2>
                <p className="text-xs text-gray-500 mb-2">BOM items use recipe component cost; non-BOM items use purchase/valuation fallback cost. Use this for menu engineering decisions.</p>
                <Card className="bg-white overflow-hidden">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-600">Item</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Qty</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Sales</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Cost</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Margin %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitability.map((r) => (
                            <tr key={r.item_code} className="border-t border-gray-100">
                              <td className="py-2 px-3 font-medium text-gray-900">{r.item_name || r.item_code}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{r.qty}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.net_sales)}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-red-600">{formatCurrency(r.total_cost)}</td>
                              <td className={`py-2 px-3 text-right tabular-nums ${r.margin_percent >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {r.margin_percent}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Item-wise sales */}
            {activeReport === 'item_sales' && (
            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Top items</h2>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>Sort by</span>
                  <select
                    value={itemSortBy}
                    onChange={(e) => setItemSortBy(e.target.value as 'both' | 'qty' | 'sales')}
                    className="rounded border border-gray-300 px-2 py-1 text-xs bg-white"
                  >
                    <option value="both">Both (default)</option>
                    <option value="qty">Quantity</option>
                    <option value="sales">Sales</option>
                  </select>
                </div>
              </div>
              <Card className="bg-white overflow-hidden">
                <CardContent className="p-0">
                  {itemwise.length === 0 ? (
                    <p className="text-sm text-gray-500 p-4">No item sales in this period.</p>
                  ) : (
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-600">Item</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Qty</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemwise.map((r) => (
                            <tr key={r.item_code} className="border-t border-gray-100">
                              <td className="py-2 px-3 font-medium text-gray-900">{r.item_name || r.item_code}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{r.qty}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-green-700">
                                {formatCurrency(r.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            )}

            {/* Time-wise sales */}
            {activeReport === 'time_sales' && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Sales by time
                <input
                  type="date"
                  value={timewiseDate}
                  onChange={(e) => setTimewiseDate(e.target.value)}
                  className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </h2>
              <Card className="bg-white overflow-hidden">
                <CardContent className="p-4">
                  {timewise.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4">No data for this date.</p>
                  ) : (
                    <div className="space-y-2">
                      {timewise.map((r) => (
                        <div key={r.time_interval} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-28 shrink-0">{r.time_interval}</span>
                          <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded min-w-[2px] transition-all"
                              style={{ width: `${(r.sales / maxTimeSales) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums w-20 text-right">{formatCurrency(r.sales)}</span>
                          <span className="text-xs text-gray-500 w-8">({r.bills})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            )}

            {/* Payment summary */}
            {activeReport === 'payments' && payments.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Payments by mode
                </h2>
                <Card className="bg-white overflow-hidden">
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Mode</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Invoices</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((r) => (
                          <tr key={r.mode_of_payment} className="border-t border-gray-100">
                            <td className="py-2 px-3 font-medium text-gray-900">{r.mode_of_payment}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{r.invoices}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-green-700">
                              {formatCurrency(r.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Staff performance */}
            {activeReport === 'staff' && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Sales by staff (waiter / cashier)
              </h2>
              <Card className="bg-white overflow-hidden">
                <CardContent className="p-0">
                  {staffPerformance.length === 0 ? (
                    <p className="text-sm text-gray-500 p-4">No data in this period.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Staff</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Invoices</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffPerformance.map((r) => (
                          <tr key={r.staff_name} className="border-t border-gray-100">
                            <td className="py-2 px-3 font-medium text-gray-900">{r.staff_name}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{r.total_invoices}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-green-700">
                              {formatCurrency(r.total_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </section>
            )}

            {/* Table turn / occupancy */}
            {activeReport === 'tables' && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <TableIcon className="w-4 h-4" />
                Table occupancy
              </h2>
              <p className="text-xs text-gray-500 mb-2">
                Bills per table and average time (minutes) per bill in this period.
              </p>
              <Card className="bg-white overflow-hidden">
                <CardContent className="p-0">
                  {tableOccupancy.length === 0 ? (
                    <p className="text-sm text-gray-500 p-4">No table data in this period.</p>
                  ) : (
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-600">Table</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-600">Room</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Bills</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Avg mins</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableOccupancy.map((r) => (
                            <tr key={r.table_name} className="border-t border-gray-100">
                              <td className="py-2 px-3 font-medium text-gray-900">{r.table_name}</td>
                              <td className="py-2 px-3 text-gray-600">{r.room_name}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{r.num_bills}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{r.avg_minutes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            )}

            {/* Production vs sale variance (manufactured items) */}
            {activeReport === 'variance' && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Production vs sale variance
              </h2>
              <p className="text-xs text-gray-500 mb-2">
                Manufactured items (with BOM): produced vs sold in selected period. Variance = produced − sold (unsold or waste).
              </p>
              <Card className="bg-white overflow-hidden">
                <CardContent className="p-0">
                  {variance.length === 0 ? (
                    <p className="text-sm text-gray-500 p-4">No manufactured items or no data in this period.</p>
                  ) : (
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-600">Item</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Produced</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Sold</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Current stock</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variance.map((r) => (
                            <tr key={r.item_code} className="border-t border-gray-100">
                              <td className="py-2 px-3 font-medium text-gray-900">{r.item_name || r.item_code}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{r.produced_qty}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-green-700">{r.sold_qty}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{r.current_stock}</td>
                              <td className={cn('py-2 px-3 text-right tabular-nums', r.variance > 0 && 'text-amber-700')}>
                                {r.variance} {r.produced_qty ? `(${r.variance_pct.toFixed(0)}%)` : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            )}

            {/* Wastage by reason */}
            {activeReport === 'wastage' && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-amber-500" />
                Wastage by reason
              </h2>
              <p className="text-xs text-gray-500 mb-2">
                Material issues recorded with a reason (e.g. Spoilage, Breakage). Record wastage in the Wastage tab.
              </p>
              <Card className="bg-white overflow-hidden">
                <CardContent className="p-0">
                  {wastageByReason.length === 0 ? (
                    <p className="text-sm text-gray-500 p-4">No wastage entries with reason in this period.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Reason</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Entries</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Total qty</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wastageByReason.map((r) => (
                          <tr key={r.reason} className="border-t border-gray-100">
                            <td className="py-2 px-3 font-medium text-gray-900">{r.reason}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{r.entries}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-amber-700">{r.total_qty}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </section>
            )}

            {/* Low stock */}
            {activeReport === 'low_stock' && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Low stock
              </h2>
              <Card className="bg-white overflow-hidden">
                <CardContent className="p-0">
                  {lowStock.length === 0 ? (
                    <p className="text-sm text-gray-500 p-4">No items below reorder level.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-600">Item</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Current</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Reorder at</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lowStock.map((r) => (
                            <tr key={r.item_code} className="border-t border-gray-100">
                              <td className="py-2 px-3 font-medium text-gray-900">{r.item_name || r.item_code}</td>
                              <td className={cn('py-2 px-3 text-right tabular-nums', r.actual_qty === 0 && 'text-red-600')}>
                                {r.actual_qty}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-gray-500">{r.reorder_level}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
