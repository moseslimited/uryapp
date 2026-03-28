import React, { useEffect, useState } from 'react';
import { Package, ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardContent } from '../components/ui';
import { Spinner } from '../components/ui/spinner';
import { showToast } from '../components/ui/toast';
import { usePOSStore } from '../store/pos-store';
import { getSellableItemsForItemsTab } from '../lib/items-api';
import { getWarehousesForTransfer, createStockTransfer } from '../lib/stock-api';
import type { SellableItemRow } from '../lib/items-api';
import type { WarehouseOption } from '../lib/stock-api';

interface TransferRow {
  item_code: string;
  item_name: string;
  qty: number;
}

export default function StockTransfer() {
  const posProfile = usePOSStore((s) => s.posProfile);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [items, setItems] = useState<SellableItemRow[]>([]);
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedQty, setSelectedQty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getWarehousesForTransfer(), posProfile?.name ? getSellableItemsForItemsTab(posProfile.name) : Promise.resolve([])])
      .then(([wh, itemList]) => {
        setWarehouses(wh);
        setItems(itemList);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [posProfile?.name]);

  const addLine = () => {
    const code = (selectedItem || '').trim();
    const qty = parseFloat(selectedQty || '0');
    if (!code || qty <= 0) {
      showToast.error('Select an item and enter quantity.');
      return;
    }
    const existing = rows.find((r) => r.item_code === code);
    if (existing) {
      setRows(rows.map((r) => (r.item_code === code ? { ...r, qty: r.qty + qty } : r)));
    } else {
      const name = items.find((i) => i.item_code === code)?.item_name || code;
      setRows([...rows, { item_code: code, item_name: name, qty }]);
    }
    setSelectedQty('');
  };

  const removeLine = (itemCode: string) => {
    setRows(rows.filter((r) => r.item_code !== itemCode));
  };

  const submit = async () => {
    if (!fromWarehouse || !toWarehouse) {
      showToast.error('Select From and To warehouse.');
      return;
    }
    if (fromWarehouse === toWarehouse) {
      showToast.error('From and To warehouse must be different.');
      return;
    }
    if (rows.length === 0) {
      showToast.error('Add at least one item with quantity.');
      return;
    }
    setSubmitting(true);
    try {
      await createStockTransfer({
        from_warehouse: fromWarehouse,
        to_warehouse: toWarehouse,
        items: rows.map((r) => ({ item_code: r.item_code, qty: r.qty })),
      });
      showToast.success('Stock transfer submitted.');
      setRows([]);
    } catch (e: unknown) {
      showToast.error(e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Transfer failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner message="Loading..." />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="w-8 h-8 text-teal-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Stock transfer</h1>
            <p className="text-sm text-gray-500">Move items from one warehouse to another</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24 space-y-4">
        <Card className="bg-white">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From warehouse</label>
                <select
                  value={fromWarehouse}
                  onChange={(e) => setFromWarehouse(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select</option>
                  {warehouses.map((w) => (
                    <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To warehouse</label>
                <select
                  value={toWarehouse}
                  onChange={(e) => setToWarehouse(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select</option>
                  {warehouses.map((w) => (
                    <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-end mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Item</label>
                <select
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  className="rounded border border-gray-300 px-3 py-2 text-sm min-w-[180px]"
                >
                  <option value="">Select item</option>
                  {items.map((i) => (
                    <option key={i.item_code} value={i.item_code}>{i.item_name} ({i.item_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Qty</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={selectedQty}
                  onChange={(e) => setSelectedQty(e.target.value)}
                  placeholder="0"
                  className="rounded border border-gray-300 px-3 py-2 text-sm w-24"
                />
              </div>
              <Button type="button" size="sm" onClick={addLine}>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>

            {rows.length > 0 ? (
              <>
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">Item</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600">Qty</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.item_code} className="border-t border-gray-100">
                          <td className="py-2 px-3 font-medium text-gray-900">{r.item_name}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{r.qty}</td>
                          <td className="py-2 px-2">
                            <button type="button" onClick={() => removeLine(r.item_code)} className="p-1 text-red-600 hover:bg-red-50 rounded" aria-label="Remove">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4">
                  <Button onClick={submit} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit transfer'}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Add items above to transfer.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
