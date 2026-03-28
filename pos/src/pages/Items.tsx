import React, { useEffect, useState } from 'react';
import { Package, Layers, FileText, X, ChevronRight } from 'lucide-react';
import { Button, Card, CardContent } from '../components/ui';
import { Dialog, DialogContent } from '../components/ui/dialog';
import { formatCurrency } from '../lib/utils';
import { usePOSStore } from '../store/pos-store';
import {
  getSellableItemsForItemsTab,
  getItemInventoryDetail,
  type SellableItemRow,
  type ItemInventoryDetail,
} from '../lib/items-api';
import { Spinner } from '../components/ui/spinner';

export default function Items() {
  const posProfile = usePOSStore((s) => s.posProfile);
  const [list, setList] = useState<SellableItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemCode, setSelectedItemCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemInventoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!posProfile?.name) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getSellableItemsForItemsTab(posProfile.name)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [posProfile?.name]);

  useEffect(() => {
    if (!selectedItemCode || !posProfile?.name) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetail(null);
    getItemInventoryDetail(selectedItemCode, posProfile.name)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedItemCode, posProfile?.name]);

  const filteredList = search.trim()
    ? list.filter(
        (i) =>
          i.item_name.toLowerCase().includes(search.toLowerCase()) ||
          i.item_code.toLowerCase().includes(search.toLowerCase())
      )
    : list;

  const openDesk = (path: string) => {
    window.open(`/app/${path}`, '_blank');
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-gray-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Items & inventory</h1>
              <p className="text-sm text-gray-500">Sellable products, stock, recipes and unit cost</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm w-48"
            />
            <Button variant="outline" size="sm" onClick={() => openDesk('item')}>
              Add item
            </Button>
            <Button variant="outline" size="sm" onClick={() => openDesk('stock-balance')}>
              <Layers className="w-4 h-4 mr-1" />
              Desk
            </Button>
          </div>
        </div>
      </div>

      {/* List of items (table-like) */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 flex justify-center">
            <Spinner message="Loading items..." />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No sellable items found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left py-2 px-4 font-medium text-gray-600">Item</th>
                  <th className="text-right py-2 px-4 font-medium text-gray-600">Stock (qty)</th>
                  <th className="text-right py-2 px-4 font-medium text-gray-600">Unit cost</th>
                  <th className="text-right py-2 px-4 font-medium text-gray-600">Current sale price</th>
                  <th className="text-center py-2 px-4 font-medium text-gray-600">Recipe</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredList.map((item, index) => (
                  <tr
                    key={item.item_code}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedItemCode(item.item_code)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedItemCode(item.item_code);
                      }
                    }}
                    className={`border-t border-gray-100 hover:bg-gray-50 cursor-pointer ${
                      selectedItemCode === item.item_code
                        ? 'bg-blue-50'
                        : index % 2 === 0
                        ? 'bg-white'
                        : 'bg-gray-50/40'
                    }`}
                  >
                    <td className="py-2 px-4">
                      <div className="font-medium text-gray-900">{item.item_name}</div>
                      <div className="text-xs text-gray-500">{item.item_code}</div>
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums">{item.actual_qty}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(item.unit_cost || 0)}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(item.recent_sale_price || 0)}</td>
                    <td className="py-2 px-4 text-center">{item.has_bom ? 'Yes' : '—'}</td>
                    <td className="py-2 px-2">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Item detail popup */}
      <Dialog open={!!selectedItemCode} onOpenChange={(open) => !open && setSelectedItemCode(null)}>
        <DialogContent
          variant="default"
          size="3xl"
          onClose={() => setSelectedItemCode(null)}
          showCloseButton={true}
          className="max-h-[90vh] overflow-y-auto"
        >
          <div className="p-6">
            {detailLoading ? (
              <div className="flex justify-center py-12">
                <Spinner message="Loading detail..." />
              </div>
            ) : detail ? (
              <>
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{detail.item_name}</h2>
                    <p className="text-sm text-gray-500">
                      {detail.item_code} · {detail.stock_uom}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      Stock (this warehouse)
                    </div>
                    <div className="text-lg font-semibold text-gray-900">Qty: {detail.actual_qty}</div>
                    <div className="text-sm text-gray-600">Value: {formatCurrency(detail.stock_value)}</div>
                    <div className="text-xs text-gray-500">Rate: {formatCurrency(detail.valuation_rate)}</div>
                  </div>
                  {detail.unit_cost != null && (
                    <div className="rounded-lg bg-amber-50 p-4">
                      <div className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-1">
                        Unit cost (from recipe)
                      </div>
                      <div className="text-lg font-semibold text-amber-900">{formatCurrency(detail.unit_cost)}</div>
                    </div>
                  )}
                  {detail.recent_sale_price != null && detail.recent_sale_price > 0 && (
                    <div className="rounded-lg bg-green-50 p-4">
                      <div className="text-xs font-medium text-green-800 uppercase tracking-wide mb-1">
                        Current sale price (last sold)
                      </div>
                      <div className="text-lg font-semibold text-green-900">
                        {formatCurrency(detail.recent_sale_price)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Warehouse breakdown */}
                {detail.warehouse_breakdown && detail.warehouse_breakdown.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Stock by warehouse</h3>
                    <div className="overflow-x-auto rounded border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-600">Warehouse</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Qty</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Rate</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.warehouse_breakdown.map((row, index) => (
                            <tr
                              key={row.warehouse}
                              className={`border-t border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                            >
                              <td className="py-2 px-3 font-medium text-gray-900">{row.warehouse}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{row.actual_qty}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(row.valuation_rate)}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(row.stock_value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Recipe (BOM) & unit cost</h3>
                  {detail.bom && detail.bom.items && detail.bom.items.length > 0 ? (
                    <>
                      <div className="mb-2 text-sm text-amber-800">
                        Unit cost (from raw materials): <strong>{formatCurrency(detail.bom.unit_cost)}</strong>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-500">
                              <th className="pb-2 pr-4">Raw material</th>
                              <th className="pb-2 pr-4">Qty</th>
                              <th className="pb-2 pr-4">Current stock</th>
                              <th className="pb-2 pr-4">Recent price</th>
                              <th className="pb-2">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.bom.items.map((row, index) => (
                              <tr
                                key={row.item_code}
                                className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                              >
                                <td className="py-2 pr-4 font-medium text-gray-900">{row.item_name}</td>
                                <td className="py-2 pr-4">
                                  {row.qty} {row.uom}
                                </td>
                                <td className="py-2 pr-4">{row.current_stock}</td>
                                <td className="py-2 pr-4">{formatCurrency(row.recent_price)}</td>
                                <td className="py-2">{formatCurrency(row.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDesk(`bill-of-materials/${detail.bom!.name}`)}
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Open BOM in Desk
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 mb-3">
                      No recipe (BOM) linked. Create a BOM in Desk (Manufacturing → BOM) for this item.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openDesk(`item/${detail.item_code}`)}>
                      <Package className="w-4 h-4 mr-1" />
                      Edit item in Desk
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openDesk('stock-balance')}>
                      <Layers className="w-4 h-4 mr-1" />
                      Stock Balance
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500">Could not load item detail.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
