import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, CreditCard, Receipt, Package, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Select, SelectItem } from '../components/ui';
import { Badge } from '../components/ui/badge';
import { formatCurrency, getFrappeErrorMessage } from '../lib/utils';
import { Spinner } from '../components/ui/spinner';
import { showToast } from '../components/ui/toast';
import {
  getPurchaseInvoices,
  getPurchaseReceipts,
  createPaymentForPurchaseInvoice,
  createPurchaseReceiptFromInvoice,
  getModesOfPayment,
  PURCHASE_PAGE_SIZE,
  type PurchaseInvoiceRow,
  type PurchaseReceiptRow,
} from '../lib/accounting-api';

type Tab = 'invoices' | 'receipts';

function StatusBadge({ status, outstanding }: { status: string; outstanding: number }) {
  const label = status || (outstanding <= 0 ? 'Paid' : outstanding >= 1 ? 'Unpaid' : 'Partially Paid');
  const variant = outstanding <= 0 ? 'success' : outstanding >= 1 ? 'destructive' : 'warning';
  return <Badge variant={variant} className="text-xs">{label}</Badge>;
}

export default function Purchases() {
  const [tab, setTab] = useState<Tab>('invoices');
  const [invoices, setInvoices] = useState<PurchaseInvoiceRow[]>([]);
  const [receipts, setReceipts] = useState<PurchaseReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [payDialog, setPayDialog] = useState<PurchaseInvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('');
  const [payRef, setPayRef] = useState('');
  const [modes, setModes] = useState<{ name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [creatingReceipt, setCreatingReceipt] = useState<string | null>(null);
  const [invoicesPage, setInvoicesPage] = useState(0);
  const [receiptsPage, setReceiptsPage] = useState(0);
  const [showAddPurchaseIframe, setShowAddPurchaseIframe] = useState(false);

  const load = () => {
    setLoading(true);
    if (tab === 'invoices') {
      getPurchaseInvoices(fromDate, toDate, onlyUnpaid, invoicesPage)
        .then(setInvoices)
        .catch(() => setInvoices([]))
        .finally(() => setLoading(false));
    } else {
      getPurchaseReceipts(fromDate, toDate, receiptsPage)
        .then(setReceipts)
        .catch(() => setReceipts([]))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    setInvoicesPage(0);
  }, [fromDate, toDate, onlyUnpaid]);
  useEffect(() => {
    setReceiptsPage(0);
  }, [fromDate, toDate]);
  useEffect(() => {
    load();
  }, [tab, fromDate, toDate, onlyUnpaid, invoicesPage, receiptsPage]);

  useEffect(() => {
    getModesOfPayment().then(setModes);
  }, []);

  const invoicesPageSubtotal = useMemo(
    () => invoices.reduce((s, inv) => s + (Number(inv.grand_total) || 0), 0),
    [invoices]
  );
  const receiptsPageSubtotal = useMemo(
    () => receipts.reduce((s, r) => s + (Number(r.grand_total) || 0), 0),
    [receipts]
  );

  const canNextInvoices = invoices.length >= PURCHASE_PAGE_SIZE && invoices.length > 0;
  const canNextReceipts = receipts.length >= PURCHASE_PAGE_SIZE && receipts.length > 0;

  const openPay = (inv: PurchaseInvoiceRow) => {
    setPayDialog(inv);
    setPayAmount(String(inv.outstanding_amount ?? inv.grand_total));
    setPayMode(modes[0]?.name ?? '');
    setPayRef('');
  };

  const handleCreateReceipt = async (inv: PurchaseInvoiceRow) => {
    setCreatingReceipt(inv.name);
    try {
      await createPurchaseReceiptFromInvoice(inv.name);
      showToast.success('Purchase receipt created successfully.');
      load();
    } catch (e: unknown) {
      showToast.error(getFrappeErrorMessage(e));
    } finally {
      setCreatingReceipt(null);
    }
  };

  const handlePay = async () => {
    if (!payDialog) return;
    const amount = parseFloat(payAmount);
    const maxOutstanding = payDialog.outstanding_amount ?? payDialog.grand_total ?? 0;
    if (Number.isNaN(amount) || amount <= 0) {
      showToast.error('Enter a valid amount to pay');
      return;
    }
    if (amount > maxOutstanding) {
      showToast.error(`Amount cannot exceed outstanding ${formatCurrency(maxOutstanding)}`);
      return;
    }
    const refTrimmed = payRef.trim();
    if (!refTrimmed) {
      showToast.error('Payment reference is required (cheque no., transfer ref., or receipt no.).');
      return;
    }
    setSubmitting(true);
    try {
      await createPaymentForPurchaseInvoice({
        purchase_invoice_name: payDialog.name,
        paid_amount: amount,
        mode_of_payment: payMode || undefined,
        reference_no: refTrimmed,
      });
      setPayDialog(null);
      showToast.success('Payment recorded successfully.');
      load();
    } catch (e: unknown) {
      showToast.error(getFrappeErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Purchases</h1>
              <p className="text-sm text-gray-500">Purchase Invoices and Receipts — pay suppliers from here</p>
            </div>
          </div>
          <Button
            onClick={() => setShowAddPurchaseIframe(true)}
            className="flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add purchase
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          {tab === 'invoices' && (
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={onlyUnpaid} onChange={(e) => setOnlyUnpaid(e.target.checked)} />
              Unpaid only
            </label>
          )}
          <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant={tab === 'invoices' ? 'default' : 'outline'} size="sm" onClick={() => setTab('invoices')}>
            <CreditCard className="w-4 h-4 mr-1" /> Invoices (Pay)
          </Button>
          <Button variant={tab === 'receipts' ? 'default' : 'outline'} size="sm" onClick={() => setTab('receipts')}>
            <Receipt className="w-4 h-4 mr-1" /> Receipts
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner message="Loading..." /></div>
        ) : tab === 'invoices' ? (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <p className="text-xs text-gray-500 px-4 pt-3 pb-1">Showing invoices for the date range. Use &quot;Unpaid only&quot; to narrow.</p>
            {invoices.length === 0 ? (
              <p className="text-gray-500 text-sm px-4 py-8 text-center">No purchase invoices in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-left">
                      <th className="py-2.5 px-3 font-medium text-gray-700">Supplier</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700">Date</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700">Invoice</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700 text-right">Amount</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700 text-right">Outstanding</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700">Status</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, idx) => (
                      <tr
                        key={inv.name}
                        className={idx % 2 === 0 ? 'bg-white border-b border-gray-100' : 'bg-gray-50/60 border-b border-gray-100'}
                      >
                        <td className="py-2.5 px-3 font-medium text-gray-900 max-w-[10rem] truncate" title={inv.supplier_name || inv.supplier}>
                          {inv.supplier_name || inv.supplier}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-gray-700">{inv.posting_date}</td>
                        <td className="py-2.5 px-3 font-mono text-xs">{inv.name}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(inv.grand_total)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-amber-700">{formatCurrency(inv.outstanding_amount)}</td>
                        <td className="py-2.5 px-3"><StatusBadge status={inv.status} outstanding={inv.outstanding_amount} /></td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {!inv.purchase_receipt && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs cursor-pointer"
                                onClick={() => handleCreateReceipt(inv)}
                                disabled={!!creatingReceipt}
                              >
                                {creatingReceipt === inv.name ? '…' : <><Package className="w-3 h-3 mr-0.5" /> Receipt</>}
                              </Button>
                            )}
                            {inv.outstanding_amount > 0 && (
                              <Button size="sm" className="h-7 text-xs cursor-pointer" onClick={() => openPay(inv)}>Pay</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600 order-2 sm:order-1">
                <span className="text-gray-500">Page subtotal: </span>
                <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(invoicesPageSubtotal)}</span>
              </p>
              <div className="flex items-center justify-center gap-2 order-1 sm:order-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={invoicesPage === 0}
                  onClick={() => setInvoicesPage((p) => Math.max(0, p - 1))}
                  className={`min-w-[7.5rem] ${invoicesPage === 0 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <ChevronLeft className="w-4 h-4 mr-0.5" />
                  Previous
                </Button>
                <span className="text-sm text-gray-600 tabular-nums min-w-[5rem] text-center">Page {invoicesPage + 1}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canNextInvoices}
                  onClick={() => setInvoicesPage((p) => p + 1)}
                  className={`min-w-[7.5rem] ${!canNextInvoices ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-0.5" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            {receipts.length === 0 ? (
              <p className="text-gray-500 text-sm px-4 py-8 text-center">No purchase receipts in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-left">
                      <th className="py-2.5 px-3 font-medium text-gray-700">Supplier</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700">Date</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700">Receipt</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700">ERP status</th>
                      <th className="py-2.5 px-3 font-medium text-gray-700 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r, idx) => (
                      <tr
                        key={r.name}
                        className={idx % 2 === 0 ? 'bg-white border-b border-gray-100' : 'bg-gray-50/60 border-b border-gray-100'}
                      >
                        <td className="py-2.5 px-3 font-medium text-gray-900 max-w-[12rem] truncate">{r.supplier_name || r.supplier}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">{r.posting_date}</td>
                        <td className="py-2.5 px-3 font-mono text-xs">{r.name}</td>
                        <td className="py-2.5 px-3 text-xs">{r.status}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-medium">{formatCurrency(r.grand_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600 order-2 sm:order-1">
                <span className="text-gray-500">Page subtotal: </span>
                <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(receiptsPageSubtotal)}</span>
              </p>
              <div className="flex items-center justify-center gap-2 order-1 sm:order-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={receiptsPage === 0}
                  onClick={() => setReceiptsPage((p) => Math.max(0, p - 1))}
                  className={`min-w-[7.5rem] ${receiptsPage === 0 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <ChevronLeft className="w-4 h-4 mr-0.5" />
                  Previous
                </Button>
                <span className="text-sm text-gray-600 tabular-nums min-w-[5rem] text-center">Page {receiptsPage + 1}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canNextReceipts}
                  onClick={() => setReceiptsPage((p) => p + 1)}
                  className={`min-w-[7.5rem] ${!canNextReceipts ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-0.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddPurchaseIframe && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50" onClick={() => { setShowAddPurchaseIframe(false); load(); }}>
          <div className="flex flex-col bg-white rounded-lg shadow-xl w-[85vw] h-[92vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50 flex-shrink-0">
              <span className="font-medium">New Purchase Invoice</span>
              <Button variant="outline" size="sm" onClick={() => { setShowAddPurchaseIframe(false); load(); }}>
                <X className="w-4 h-4 mr-1" /> Close
              </Button>
            </div>
            <iframe
              title="New Purchase Invoice"
              src={`${window.location.origin}/app/purchase-invoice/new`}
              className="flex-1 w-full min-h-0 border-0"
            />
          </div>
        </div>
      )}

      {payDialog && (
        <Dialog open={!!payDialog} onOpenChange={(open) => !open && setPayDialog(null)}>
          <DialogContent size="sm" className="sm:max-w-md" onClose={() => setPayDialog(null)} showCloseButton>
            <DialogHeader className="p-4 pb-2 text-left">
              <DialogTitle className="text-lg font-semibold text-gray-900">Pay {payDialog.supplier_name || payDialog.supplier}</DialogTitle>
              <p className="text-sm text-gray-500 mt-1">Outstanding: {formatCurrency(payDialog.outstanding_amount ?? 0)} — enter full or partial amount below.</p>
            </DialogHeader>
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount to pay</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={payDialog.outstanding_amount ?? payDialog.grand_total}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={String(payDialog.outstanding_amount ?? payDialog.grand_total ?? '0')}
                  className="h-10"
                />
                <p className="text-xs text-gray-500 mt-1">Partial payments allowed. Max: {formatCurrency(payDialog.outstanding_amount ?? 0)}</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setPayAmount(String(payDialog.outstanding_amount ?? payDialog.grand_total ?? ''))}>
                  Pay full amount
                </Button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mode of payment</label>
                <Select value={payMode} onValueChange={setPayMode} placeholder={modes.length ? 'Select mode' : 'Loading…'} disabled={!modes.length}>
                  {modes.map((m) => (
                    <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Payment reference <span className="text-red-600">*</span>
                </label>
                <Input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Cheque no. / bank transfer ref. / receipt no."
                  className="h-10"
                  required
                  autoComplete="off"
                />
                <p className="text-xs text-amber-700 mt-1">Required — payments cannot be submitted without a reference.</p>
              </div>
            </div>
            <DialogFooter className="p-4 pt-2 flex flex-row justify-end gap-2 border-t border-gray-100">
              <Button variant="outline" onClick={() => setPayDialog(null)}>Cancel</Button>
              <Button onClick={handlePay} disabled={submitting}>{submitting ? 'Creating…' : 'Create payment'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
