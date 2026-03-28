import React, { useCallback, useEffect, useState } from 'react';
import { Package, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui';
import { getRawMaterialsRemaining, type RawMaterialRemainingRow } from '../lib/raw-materials-api';
import { usePOSStore } from '../store/pos-store';
import { Spinner } from '../components/ui/spinner';

export default function RawMaterials() {
  const posProfile = usePOSStore((s) => s.posProfile);
  const [list, setList] = useState<RawMaterialRemainingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    if (!posProfile?.name) {
      setLoading(false);
      setList([]);
      return;
    }
    setLoading(true);
    getRawMaterialsRemaining(posProfile.name)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [posProfile?.name]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredList = search.trim()
    ? list.filter(
        (i) =>
          i.item_name.toLowerCase().includes(search.toLowerCase()) ||
          i.item_code.toLowerCase().includes(search.toLowerCase())
      )
    : list;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-gray-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Raw materials remaining</h1>
              <p className="text-sm text-gray-500">
                Current stock of raw materials in POS warehouse (BOM components + Item Group Raw Materials)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm w-48"
            />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 flex justify-center">
            <Spinner message="Loading raw materials..." />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            {list.length === 0
              ? 'No raw materials found. Ensure items are in Item Group "Raw Materials" or used in a BOM, and POS Profile has a warehouse.'
              : 'No items match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left py-2 px-4 font-medium text-gray-600">Item</th>
                  <th className="text-right py-2 px-4 font-medium text-gray-600">Qty remaining</th>
                  <th className="text-left py-2 px-4 font-medium text-gray-600">UOM</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((row) => (
                  <tr key={row.item_code} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-4">
                      <div className="font-medium text-gray-900">{row.item_name}</div>
                      <div className="text-xs text-gray-500">{row.item_code}</div>
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums font-medium">
                      {row.actual_qty}
                    </td>
                    <td className="py-2 px-4 text-gray-600">{row.stock_uom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
