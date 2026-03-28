import React, { useState, useEffect, useRef } from 'react';
import { X, Percent, Coins, Banknote, CreditCard } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn, formatCurrency } from '../lib/utils';
import { Button, Input, Dialog, DialogContent } from './ui';
import { Select, SelectItem } from './ui';
import { call } from '../lib/frappe-sdk';
import { getWaiters, type WaiterOption } from '../lib/waiter-api';
import { useRootStore } from '../store/root-store';

/** Stable key for payment mode rows (API may return string or object with mode_of_payment / id). */
function paymentModeId(mode: any): string {
  if (typeof mode === 'string') return mode;
  return String(mode?.mode_of_payment ?? mode?.id ?? mode?.name ?? '');
}

export interface PaymentDialogItem {
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

interface PaymentDialogProps {
  onClose: () => void;
  grandTotal: number;
  roundedTotal: number;
  invoice: string;
  customer: string;
  posProfile: string;
  table: string | null;
  cashier: string;
  owner: string;
  fetchOrders: () => Promise<void>;
  clearSelectedOrder: () => void;
  /** Optional: show order items for final review before payment */
  items?: PaymentDialogItem[];
  /** User id or label from invoice/order — used to pre-select waiter */
  invoiceWaiter?: string | null;
}

const PaymentDialog: React.FC<PaymentDialogProps> = ({
  onClose,
  grandTotal,
  roundedTotal,
  invoice,
  customer,
  posProfile,
  table,
  cashier,
  owner,
  fetchOrders,
  clearSelectedOrder,
  items = [],
  invoiceWaiter = null,
}) => {
  const { paymentModes, fetchPaymentModes, posProfile: storePosProfile } = usePOSStore();
  const user = useRootStore((s) => s.user);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discountType] = useState<'percentage'>('percentage'); // Only percentage now
  const [discountValue, setDiscountValue] = useState<string>('');
  const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
  const [tipValue, setTipValue] = useState<string>('');
  const [paymentInputs, setPaymentInputs] = useState<{ [mode: string]: string }>({});
  const [waiters, setWaiters] = useState<WaiterOption[]>([]);
  const [waitersLoading, setWaitersLoading] = useState(false);
  const [selectedWaiter, setSelectedWaiter] = useState<WaiterOption | null>(null);
  const didAutoPickWaiter = useRef(false);

  useEffect(() => {
    fetchPaymentModes();
  }, [fetchPaymentModes]);

  useEffect(() => {
    didAutoPickWaiter.current = false;
    setSelectedWaiter(null);
  }, [invoice]);

  useEffect(() => {
    setWaitersLoading(true);
    getWaiters()
      .then((list) => setWaiters(list))
      .catch(() => setWaiters([]))
      .finally(() => setWaitersLoading(false));
  }, []);

  // Pre-select waiter so Pay is not stuck disabled (invoice waiter → logged-in user → cashier/owner → single or first)
  useEffect(() => {
    if (!waiters.length || didAutoPickWaiter.current) return;
    const matchId = (id?: string | null) =>
      id
        ? waiters.find((w) => w.name === id || w.full_name === id) ?? null
        : null;
    const picked =
      matchId(invoiceWaiter) ||
      matchId(user?.name) ||
      matchId(cashier) ||
      matchId(owner) ||
      (waiters.length === 1 ? waiters[0] : null) ||
      waiters[0];
    if (picked) {
      setSelectedWaiter(picked);
      didAutoPickWaiter.current = true;
    }
  }, [invoice, waiters, invoiceWaiter, user?.name, cashier, owner]);

  // Calculate split payment total
  const payments = paymentModes
    .map((mode: any) => {
      const id = paymentModeId(mode);
      if (!id) return null;
      const amount = parseFloat(paymentInputs[id] || '');
      return amount > 0 ? { mode_of_payment: id, amount } : null;
    })
    .filter(Boolean);
  const paymentsTotal = payments.reduce((sum, p: any) => sum + p.amount, 0);

  const handleApplyDiscount = () => {
    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      setError('Please enter a valid discount value');
      return;
    }
    if (value > 100) {
      setError('Percentage discount cannot exceed 100%');
      return;
    }
    const calculatedDiscount = (grandTotal * value) / 100;
    setAppliedDiscount(calculatedDiscount);
    setError(null);
  };

  // Service charge from profile (%)
  const serviceChargePct = Math.max(0, Number(storePosProfile?.custom_service_charge_percentage) || 0);
  const tipAmount = Math.max(0, parseFloat(tipValue) || 0);

  // Order summary logic
  const subtotal = grandTotal;
  const adjustment = roundedTotal - grandTotal;
  const roundedAdjustment = Math.round(adjustment * 100) / 100;
  const showAdjustment = Math.abs(roundedAdjustment) > 0.001;
  const totalDiscount = appliedDiscount;
  const discountedTotal = Math.max(0, subtotal - totalDiscount);
  const serviceChargeAmount = serviceChargePct ? (discountedTotal * serviceChargePct) / 100 : 0;
  const totalBeforeRound = discountedTotal + serviceChargeAmount + tipAmount;
  const finalTotal = appliedDiscount > 0 || serviceChargeAmount > 0 || tipAmount > 0
    ? Math.ceil(totalBeforeRound) : Math.round(totalBeforeRound);
  const finalAdjustment = finalTotal - totalBeforeRound;
  const roundedFinalAdjustment = Math.round(finalAdjustment * 100) / 100;
  const showFinalAdjustment = Math.abs(roundedFinalAdjustment) > 0.001;

  // Helper to calculate remaining balance
  const getRemainingBalance = (currentId: string) => {
    const totalEntered = Object.entries(paymentInputs)
      .filter(([id]) => id !== currentId)
      .reduce((sum, [_, val]) => sum + (parseFloat(val) || 0), 0);
    return Math.max(0, finalTotal - totalEntered);
  };

  // Quick payment: pay full with one mode
  const handleQuickPayFull = (modeId: string) => {
    setPaymentInputs(() => {
      const next: { [k: string]: string } = {};
      paymentModes.forEach((m: any) => {
        const id = paymentModeId(m);
        if (!id) return;
        next[id] = id === modeId ? String(finalTotal) : '';
      });
      return next;
    });
  };

  const handleQuickSplitHalf = () => {
    const modes = paymentModes.map((m: any) => paymentModeId(m)).filter(Boolean);
    if (modes.length < 2) return;
    const half = finalTotal / 2;
    setPaymentInputs(() => ({
      [modes[0]]: String(Math.round(half * 100) / 100),
      [modes[1]]: String(Math.round((finalTotal - half) * 100) / 100),
    }));
  };

  // Handler for input focus to auto-fill remaining balance
  const handlePaymentInputFocus = (id: string) => {
    setPaymentInputs(inputs => {
      // Only auto-fill if the field is empty or zero
      if (!inputs[id] || parseFloat(inputs[id]) === 0) {
        const remaining = getRemainingBalance(id);
        return { ...inputs, [id]: remaining > 0 ? String(remaining) : '' };
      }
      return inputs;
    });
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      if (!selectedWaiter) {
        setError('Please select the waiter who served this order.');
        setIsProcessing(false);
        return;
      }

      await call.post('ury.ury.doctype.ury_order.ury_order.make_invoice', {
        additionalDiscount: discountValue ? parseInt(discountValue) : null,
        cashier,
        customer,
        invoice,
        owner,
        payments,
        pos_profile: posProfile,
        table,
        waiter: selectedWaiter.name,
        tip_amount: tipAmount > 0 ? tipAmount : null,
        service_charge_amount: serviceChargeAmount > 0 ? serviceChargeAmount : null,
      });
      // Show toast and reload orders (assume showToast and reload available globally)
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast.success('Payment successful');
      }
      onClose();
      clearSelectedOrder();
      await fetchOrders();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent variant="xlarge" className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row p-0" showCloseButton={false}>
        {/* Left Column - Discount and Payment Mode */}
        <div className="md:w-1/2 p-6 border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Payment</h2>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="p-2"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Discount Section (conditional) */}
          {storePosProfile?.enable_discount === 1 && (
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Percent className="w-5 h-5" />
                Apply Discount
              </h3>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={'Enter %'}
                  size="sm"
                  className="flex-1"
                />
                <Button
                  onClick={handleApplyDiscount}
                  variant="default"
                  size="sm"
                >
                  Apply
                </Button>
              </div>
            </div>
          )}

          {/* Waiter who served (required) */}
          <div className="space-y-2 mb-6">
            <h3 className="text-sm font-semibold text-gray-700">Waiter who served</h3>
            <Select
              value={selectedWaiter?.name ?? ''}
              onValueChange={(value) => {
                const w = waiters.find((x) => x.name === value) ?? null;
                setSelectedWaiter(w);
              }}
              placeholder={waitersLoading ? 'Loading...' : 'Select waiter...'}
              disabled={waitersLoading}
            >
              {waiters.map((w) => (
                <SelectItem key={w.name} value={w.name}>
                  {w.full_name || w.name}
                </SelectItem>
              ))}
            </Select>
            {!waitersLoading && waiters.length > 0 && !selectedWaiter && (
              <p className="text-amber-700 text-xs">Select who served this order to enable Pay.</p>
            )}
          </div>

          {/* Tip */}
          <div className="space-y-2 mb-6">
            <h3 className="text-sm font-semibold text-gray-700">Tip (optional)</h3>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={tipValue}
              onChange={(e) => setTipValue(e.target.value)}
              placeholder="0"
              size="sm"
            />
          </div>

          {/* Quick payment buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {paymentModes.slice(0, 2).map((mode: any) => {
              const id = paymentModeId(mode);
              if (!id) return null;
              const label =
                typeof mode === 'string' ? mode : mode.mode_of_payment ?? mode.name ?? id;
              return (
                <Button
                  key={id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickPayFull(id)}
                >
                  {id.toLowerCase().includes('cash') ? <Banknote className="w-4 h-4 mr-1" /> : <CreditCard className="w-4 h-4 mr-1" />}
                  Pay full with {label}
                </Button>
              );
            })}
            {paymentModes.length >= 2 && (
              <Button variant="outline" size="sm" onClick={handleQuickSplitHalf}>
                Split 50 / 50
              </Button>
            )}
          </div>

          {/* Payment Methods Section - Split Payment */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold">Payment Methods</h3>
            <div className="grid grid-cols-1 gap-3">
              {paymentModes.map((mode: any) => {
                const id = paymentModeId(mode);
                if (!id) return null;
                const label =
                  typeof mode === 'string' ? mode : mode.name ?? mode.mode_of_payment ?? id;
                return (
                  <div key={id} className="flex items-center gap-3">
                    <span className="w-24 font-medium">{label}</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentInputs[id] || ''}
                      onChange={e => setPaymentInputs(inputs => ({ ...inputs, [id]: e.target.value }))}
                      onFocus={() => handlePaymentInputFocus(id)}
                      placeholder="Amount"
                      className="flex-1"
                      size="sm"
                      disabled={isProcessing}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="font-medium">Total Entered</span>
              <span className={'text-green-600 font-semibold flex items-center gap-1'}>
                {formatCurrency(paymentsTotal)} / {formatCurrency(finalTotal)}
                {paymentsTotal > finalTotal && (
                  <span className="text-yellow-700 font-semibold">
                    <Coins className="inline w-4 h-4 ml-1 text-yellow-500" />
                    <span className="text-yellow-500 font-bold ml-1">{formatCurrency(paymentsTotal - finalTotal)}</span>
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column - Order Summary and Pay Button */}
        <div className="md:w-1/2 p-6 overflow-y-auto">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Order items for final review (when provided) */}
          {items.length > 0 && (
            <div className="space-y-2 mb-6">
              <h3 className="text-lg font-semibold">Order items</h3>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {items.map((line, i) => (
                  <div key={i} className="flex justify-between items-start gap-2 px-3 py-2 text-sm">
                    <span className="text-gray-800 flex-1">{line.item_name}</span>
                    <span className="text-gray-500 shrink-0">{line.qty} × {formatCurrency(line.rate)}</span>
                    <span className="font-medium shrink-0">{formatCurrency(line.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="space-y-3 mb-6">
            <h3 className="text-lg font-semibold">Order Summary</h3>
            <div className="space-y-2 text-sm">
              {/* Subtotal (Grand Total) */}
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {/* Discount */}
              {appliedDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(appliedDiscount)}</span>
                </div>
              )}
              {/* Service charge */}
              {serviceChargeAmount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Service charge ({serviceChargePct}%)</span>
                  <span>{formatCurrency(serviceChargeAmount)}</span>
                </div>
              )}
              {/* Tip */}
              {tipAmount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tip</span>
                  <span>{formatCurrency(tipAmount)}</span>
                </div>
              )}
              {/* Adjustment (if any) */}
              {showFinalAdjustment && (
                <div className="flex justify-between text-blue-600">
                  <span>Adjustment</span>
                  <span>{roundedFinalAdjustment > 0 ? '+' : ''}{formatCurrency(roundedFinalAdjustment)}</span>
                </div>
              )}
              {/* Final Total (Rounded) */}
              <div className="border-t pt-2">
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>{formatCurrency(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Button */}
          <Button
            onClick={handlePayment}
            disabled={isProcessing || payments.length === 0 || !selectedWaiter}
            variant={isProcessing || payments.length === 0 || !selectedWaiter ? "secondary" : "default"}
            className="w-full"
          >
            {isProcessing ? 'Processing...' : `Pay ${formatCurrency(paymentsTotal>0?paymentsTotal:finalTotal)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog; 