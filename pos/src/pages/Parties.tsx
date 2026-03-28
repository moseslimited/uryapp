import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, RefreshCw, Truck, ExternalLink, Package } from 'lucide-react';
import { Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Select, SelectItem } from '../components/ui';
import { Spinner } from '../components/ui/spinner';
import { formatCurrency, getFrappeErrorMessage, cn } from '../lib/utils';
import { showToast } from '../components/ui/toast';
import {
  getUnpaidPartyLines,
  type CustomerUnpaidLine,
  type SupplierUnpaidLine,
} from '../lib/parties-api';
import PaymentDialog from '../components/PaymentDialog';
import { getOrderByInvoiceId, type POSInvoice } from '../lib/order-api';
import { usePOSStore } from '../store/pos-store';
import {
  createPaymentForPurchaseInvoice,
  createPurchaseReceiptFromInvoice,
  getModesOfPayment,
  type PurchaseInvoiceRow,
} from '../lib/accounting-api';

type PartyView = 'customers' | 'suppliers';

const partyNav: { id: PartyView; label: string; hint: string; icon: React.ElementType }[] = [
  { id: 'customers', label: 'Customer receivables', hint: 'Sales invoices & Pay Later', icon: Users },
  { id: 'suppliers', label: 'Supplier payables', hint: 'Outstanding purchase invoices', icon: Truck },
];

function deskUrl(path: string) {
  const base = window.location.origin;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export default function Parties() {
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<PartyView>('customers');
  const [customerLines, setCustomerLines] = useState<CustomerUnpaidLine[]>([]);
  const [supplierLines, setSupplierLines] = useState<SupplierUnpaidLine[]>([]);

  const [payingInvoice, setPayingInvoice] = useState<POSInvoice | null>(null);
  const [openingPayForInvoiceId, setOpeningPayForInvoiceId] = useState<string | null>(null);
  const profileFromStore = usePOSStore((s) => s.posProfile);

  const [payDialog, setPayDialog] = useState<PurchaseInvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('');
  const [payRef, setPayRef] = useState('');
  const [modes, setModes] = useState<{ name: string }[]>([]);
  const [submittingPay, setSubmittingPay] = useState(false);
  const [creatingReceipt, setCreatingReceipt] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getUnpaidPartyLines()
      .then((data) => {
        setCustomerLines(data.customer_lines ?? []);
        setSupplierLines(data.supplier_lines ?? []);
      })
      .catch(() => {
        setCustomerLines([]);
        setSupplierLines([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getModesOfPayment().then(setModes);
  }, []);

  const customersTotal = useMemo(
    () => customerLines.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [customerLines]
  );
  const suppliersTotal = useMemo(
    () => supplierLines.reduce((s, r) => s + (Number(r.outstanding_amount) || 0), 0),
    [supplierLines]
  );

  const openPayDialog = async (invoiceName: string) => {
    setOpeningPayForInvoiceId(invoiceName);
    try {
      const invoice = await getOrderByInvoiceId(invoiceName);
      if (!invoice) {
        showToast.error(`Invoice ${invoiceName} was not found. Refresh and try again.`);
        return;
      }
      setPayingInvoice(invoice);
    } catch (e) {
      showToast.error(e instanceof Error ? e.message : 'Failed to open payment dialog');
    } finally {
      setOpeningPayForInvoiceId(null);
    }
  };

  const openSupplierPay = (row: SupplierUnpaidLine) => {
    const inv: PurchaseInvoiceRow = {
      name: row.name,
      supplier: row.supplier,
      supplier_name: row.supplier_name,
      posting_date: row.posting_date,
      grand_total: row.grand_total,
      outstanding_amount: row.outstanding_amount,
      status: row.status || '',
      currency: row.currency || '',
      purchase_receipt: row.purchase_receipt ?? null,
    };
    setPayDialog(inv);
    setPayAmount(String(row.outstanding_amount ?? row.grand_total));
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

  const handlePaySupplier = async () => {
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
    setSubmittingPay(true);
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
      setSubmittingPay(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Parties</h1>
              <p className="text-sm text-gray-500">Unpaid receivables and payables — pay from here where supported</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Spinner message="Loading unpaid documents..." />
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-4 max-w-[1600px] mx-auto">
            <aside className="col-span-12 lg:col-span-3 xl:col-span-2">
              <Card className="bg-white border-gray-200 lg:sticky lg:top-4 shadow-sm">
                <CardContent className="p-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-2 mb-2">
                    Party navigator
                  </h2>
                  <div className="space-y-1">
                    {partyNav.map((nav) => {
                      const Icon = nav.icon;
                      const selected = activeView === nav.id;
                      return (
                        <button
                          key={nav.id}
                          type="button"
                          onClick={() => setActiveView(nav.id)}
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

            <div className="col-span-12 lg:col-span-9 xl:col-span-10">
              {activeView === 'customers' && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/90">
                    <h2 className="text-sm font-semibold text-gray-900">Customer receivables</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Sales Invoices with balance and draft POS <strong>Pay Later</strong> orders. Use <strong>Pay</strong> for Pay Later; open Sales Invoices in ERP to record payment.
                    </p>
                  </div>
                  {customerLines.length === 0 ? (
                    <p className="text-sm text-gray-500 px-4 py-12 text-center">No outstanding customer documents.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-left">
                              <th className="py-2.5 px-3 font-medium text-gray-700">Type</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700">Customer</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700">Document</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700">Date</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700 text-right">Outstanding</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700">Status</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerLines.map((r, idx) => (
                              <tr
                                key={`${r.line_kind}-${r.document}`}
                                className={idx % 2 === 0 ? 'bg-white border-b border-gray-100' : 'bg-gray-50/70 border-b border-gray-100'}
                              >
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {r.line_kind === 'pay_later' ? (
                                    <span className="inline-flex rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-xs font-medium">Pay Later</span>
                                  ) : (
                                    <span className="inline-flex rounded-full bg-slate-100 text-slate-800 px-2 py-0.5 text-xs font-medium">Sales Inv.</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="font-medium text-gray-900">{r.customer_name}</span>
                                  <span className="block text-[11px] text-gray-500 font-mono">{r.customer}</span>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-xs">{r.document}</td>
                                <td className="py-2.5 px-3 whitespace-nowrap text-gray-700">{r.posting_date}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-gray-900">{formatCurrency(r.amount)}</td>
                                <td className="py-2.5 px-3 text-xs text-gray-600">{r.status || '—'}</td>
                                <td className="py-2.5 px-3 text-right">
                                  {r.line_kind === 'pay_later' ? (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs cursor-pointer"
                                      onClick={() => openPayDialog(r.document)}
                                      disabled={openingPayForInvoiceId === r.document}
                                    >
                                      {openingPayForInvoiceId === r.document ? 'Opening…' : 'Pay'}
                                    </Button>
                                  ) : (
                                    <a
                                      href={deskUrl(`/app/sales-invoice/${encodeURIComponent(r.document)}`)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline cursor-pointer"
                                    >
                                      Open
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-gray-600">
                          <span className="text-gray-500">Rows: </span>
                          <span className="font-medium tabular-nums">{customerLines.length}</span>
                        </span>
                        <span className="text-gray-900">
                          <span className="text-gray-500">Total outstanding: </span>
                          <span className="font-semibold tabular-nums">{formatCurrency(customersTotal)}</span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeView === 'suppliers' && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/90">
                    <h2 className="text-sm font-semibold text-gray-900">Supplier payables</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Purchase Invoices with outstanding amount. Create a receipt if needed, then record payment.
                    </p>
                  </div>
                  {supplierLines.length === 0 ? (
                    <p className="text-sm text-gray-500 px-4 py-12 text-center">No outstanding supplier invoices.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-left">
                              <th className="py-2.5 px-3 font-medium text-gray-700">Supplier</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700">Invoice</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700">Date</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700 text-right">Outstanding</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700 text-right">Invoice total</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700">Status</th>
                              <th className="py-2.5 px-3 font-medium text-gray-700 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {supplierLines.map((r, idx) => (
                              <tr
                                key={r.name}
                                className={idx % 2 === 0 ? 'bg-white border-b border-gray-100' : 'bg-gray-50/70 border-b border-gray-100'}
                              >
                                <td className="py-2.5 px-3">
                                  <span className="font-medium text-gray-900">{r.supplier_name}</span>
                                  <span className="block text-[11px] text-gray-500 font-mono">{r.supplier}</span>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-xs">{r.name}</td>
                                <td className="py-2.5 px-3 whitespace-nowrap">{r.posting_date}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-amber-800">{formatCurrency(r.outstanding_amount)}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">{formatCurrency(r.grand_total)}</td>
                                <td className="py-2.5 px-3 text-xs">{r.status || '—'}</td>
                                <td className="py-2.5 px-3 text-right">
                                  <div className="flex flex-wrap justify-end gap-1">
                                    {!r.purchase_receipt && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs cursor-pointer"
                                        onClick={() =>
                                          handleCreateReceipt({
                                            name: r.name,
                                            supplier: r.supplier,
                                            supplier_name: r.supplier_name,
                                            posting_date: r.posting_date,
                                            grand_total: r.grand_total,
                                            outstanding_amount: r.outstanding_amount,
                                            status: r.status,
                                            currency: r.currency,
                                            purchase_receipt: null,
                                          })
                                        }
                                        disabled={!!creatingReceipt}
                                      >
                                        {creatingReceipt === r.name ? '…' : (
                                          <>
                                            <Package className="w-3 h-3 mr-0.5" />
                                            Receipt
                                          </>
                                        )}
                                      </Button>
                                    )}
                                    <Button size="sm" className="h-7 text-xs cursor-pointer" onClick={() => openSupplierPay(r)}>
                                      Pay
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-gray-600">
                          <span className="text-gray-500">Rows: </span>
                          <span className="font-medium tabular-nums">{supplierLines.length}</span>
                        </span>
                        <span className="text-gray-900">
                          <span className="text-gray-500">Total outstanding: </span>
                          <span className="font-semibold tabular-nums">{formatCurrency(suppliersTotal)}</span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {payingInvoice && (
        <PaymentDialog
          onClose={() => setPayingInvoice(null)}
          grandTotal={Number((payingInvoice as any).grand_total ?? 0)}
          roundedTotal={Number((payingInvoice as any).rounded_total ?? (payingInvoice as any).grand_total ?? 0)}
          invoice={payingInvoice.name}
          customer={String((payingInvoice as any).customer ?? '')}
          posProfile={String((payingInvoice as any).pos_profile ?? profileFromStore?.pos_profile ?? '')}
          table={((payingInvoice as any).restaurant_table as string | null) ?? null}
          cashier={String((payingInvoice as any).cashier ?? '')}
          owner={String((payingInvoice as any).owner ?? '')}
          fetchOrders={load}
          clearSelectedOrder={() => {}}
          items={((payingInvoice as any).items ?? []).map((line: any) => ({
            item_name: String(line.item_name ?? ''),
            qty: Number(line.qty ?? 0),
            rate: Number(line.rate ?? 0),
            amount: Number(line.amount ?? 0),
          }))}
          invoiceWaiter={String((payingInvoice as any).waiter ?? '') || null}
        />
      )}

      {payDialog && (
        <Dialog open={!!payDialog} onOpenChange={(open) => !open && setPayDialog(null)}>
          <DialogContent size="sm" className="sm:max-w-md" onClose={() => setPayDialog(null)} showCloseButton>
            <DialogHeader className="p-4 pb-2 text-left">
              <DialogTitle className="text-lg font-semibold text-gray-900">Pay {payDialog.supplier_name || payDialog.supplier}</DialogTitle>
              <p className="text-sm text-gray-500 mt-1">Invoice {payDialog.name} — Outstanding: {formatCurrency(payDialog.outstanding_amount ?? 0)}</p>
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
                  className="h-10"
                />
                <Button variant="outline" size="sm" className="mt-2" type="button" onClick={() => setPayAmount(String(payDialog.outstanding_amount ?? payDialog.grand_total ?? ''))}>
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
                <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Cheque / transfer ref." className="h-10" />
              </div>
            </div>
            <DialogFooter className="p-4 pt-2 flex flex-row justify-end gap-2 border-t border-gray-100">
              <Button variant="outline" onClick={() => setPayDialog(null)}>Cancel</Button>
              <Button onClick={handlePaySupplier} disabled={submittingPay}>{submittingPay ? 'Creating…' : 'Create payment'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
