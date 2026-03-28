import React, { useEffect, useState } from 'react';
import { Trash2, Package } from 'lucide-react';
import { Button, Card, CardContent } from '../components/ui';
import { usePOSStore } from '../store/pos-store';
import { getSellableItemsForItemsTab } from '../lib/items-api';
import { getWastageReasons, createWastageEntry } from '../lib/wastage-api';
import { getRawMaterialsRemaining } from '../lib/raw-materials-api';
import { Spinner } from '../components/ui/spinner';
import { showToast } from '../components/ui/toast';
import { getFrappeErrorMessage } from '../lib/utils';

type SellableRow = { item_code: string; item_name: string };
type WastageSelectableItem = { item_code: string; item_name: string; type: 'finished' | 'raw' };

export default function Wastage() {
  const posProfile = usePOSStore((s) => s.posProfile);
  const [items, setItems] = useState<WastageSelectableItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [reasons, setReasons] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [itemCode, setItemCode] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('Other');
  const [errorText, setErrorText] = useState<string | null>(null);

  const getFriendlyWastageError = (raw: string) => {
    const msg = (raw || '').trim();
    if (!msg) return 'Failed to record wastage. Please try again.';
    if (msg.includes('Wastage / Material Issue Expense Account')) {
      return 'Wastage expense account is missing on this POS Profile. Open POS Profile -> Accounts and set "Wastage / Material Issue Expense Account".';
    }
    if (msg.toLowerCase().includes('stock entry type') || msg.includes('stock_entry_type')) {
      return 'Stock Entry Type for Material Issue is missing. In Desk, create/configure a Stock Entry Type with Purpose = Material Issue, then retry.';
    }
    return msg;
  };

  useEffect(() => {
    if (!posProfile?.name) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      getSellableItemsForItemsTab(posProfile.name),
      getRawMaterialsRemaining(posProfile.name),
      getWastageReasons(),
    ])
      .then(([itemList, rawList, reasonList]) => {
        const merged = new Map<string, WastageSelectableItem>();
        (itemList as SellableRow[]).forEach((i) => {
          merged.set(i.item_code, { item_code: i.item_code, item_name: i.item_name || i.item_code, type: 'finished' });
        });
        rawList.forEach((r) => {
          if (!merged.has(r.item_code)) {
            merged.set(r.item_code, { item_code: r.item_code, item_name: r.item_name || r.item_code, type: 'raw' });
          }
        });
        setItems(
          Array.from(merged.values()).sort((a, b) =>
            (a.item_name || a.item_code).localeCompare(b.item_name || b.item_code)
          )
        );
        setReasons(reasonList);
        if (reasonList.length && !reasonList.some((r) => r.value === reason)) {
          setReason(reasonList[0]?.value ?? 'Other');
        }
      })
      .catch(() => {
        setItems([]);
        setReasons([]);
      })
      .finally(() => setLoading(false));
  }, [posProfile?.name]);

  const handleSubmit = async () => {
    const resolvedItemCode =
      itemCode ||
      items.find((i) => `${i.item_name} (${i.item_code})` === itemSearch || i.item_code === itemSearch)?.item_code ||
      '';
    if (!posProfile?.name || !resolvedItemCode || !qty) {
      showToast.error('Select item and enter quantity');
      return;
    }
    const numQty = parseFloat(qty);
    if (Number.isNaN(numQty) || numQty <= 0) {
      showToast.error('Enter a valid quantity');
      return;
    }
    setSubmitting(true);
    setErrorText(null);
    try {
      const res = await createWastageEntry(posProfile.name, resolvedItemCode, numQty, reason);
      showToast.success(typeof res.message === 'string' ? res.message : 'Wastage recorded.');
      setQty('');
      setItemCode('');
      setItemSearch('');
    } catch (e: unknown) {
      const friendly = getFriendlyWastageError(getFrappeErrorMessage(e));
      setErrorText(friendly);
      showToast.error(friendly);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <Trash2 className="w-8 h-8 text-amber-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Record wastage</h1>
            <p className="text-sm text-gray-500">Issue stock as wastage and choose a reason for reports</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner message="Loading..." />
          </div>
        ) : (
          <Card className="max-w-md">
            <CardContent className="pt-6">
              <div className="space-y-4">
                {errorText && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-sm font-medium text-red-800">Could not record wastage</p>
                    <p className="mt-1 text-xs text-red-700">{errorText}</p>
                    {posProfile?.name && (
                      <div className="mt-2">
                        <a
                          href={`/app/pos-profile/${encodeURIComponent(posProfile.name)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-red-800 underline"
                        >
                          Open POS Profile settings
                        </a>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => {
                      const v = e.target.value;
                      setItemSearch(v);
                      const match = items.find((i) => `${i.item_name} (${i.item_code})` === v);
                      if (match) setItemCode(match.item_code);
                    }}
                    list="wastage-items-list"
                    placeholder="Search item by name or code..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                  <datalist id="wastage-items-list">
                    {items.map((i) => (
                      <option key={i.item_code} value={`${i.item_name || i.item_code} (${i.item_code})`}>
                        {i.type === 'finished' ? 'Finished good' : 'Raw material'}
                      </option>
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-gray-500">
                    Choose a finished good (with BOM) or raw material. BOM items issue component raws on submit.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason (for reports)</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    {reasons.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={submitting || !itemCode || !qty}
                >
                  <Package className="w-4 h-4 mr-2 inline" />
                  {submitting ? 'Recording…' : 'Record wastage'}
                </Button>
              </div>
              <p className="mt-4 text-xs text-gray-500">
                This creates a Material Issue Stock Entry from your POS warehouse. Use Reports → Wastage by reason to see losses by category.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
