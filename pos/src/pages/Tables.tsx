import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Circle, Square, RectangleHorizontal, User, Clock, Receipt } from 'lucide-react';
import { Button, Card, CardContent } from '../components/ui';
import { Spinner } from '../components/ui/spinner';
import { formatCurrency } from '../lib/utils';
import { usePOSStore } from '../store/pos-store';
import { getRooms, getTables, setCustomersServed, freeTable, Room, Table } from '../lib/table-api';
import { getTableOrders, getOrderByInvoiceId } from '../lib/order-api';
import type { TableOrderSummary } from '../lib/order-api';
import PaymentDialog from '../components/PaymentDialog';
import { showToast } from '../components/ui/toast';
import { cn } from '../lib/utils';

const TableIcon = ({ type, className }: { type: 'Circle' | 'Square' | 'Rectangle' | undefined; className?: string }) => {
  switch (type) {
    case 'Circle':
      return <Circle className={className} />;
    case 'Square':
      return <Square className={className} />;
    case 'Rectangle':
      return <RectangleHorizontal className={className} />;
    default:
      return <Square className={className} />;
  }
};

export default function Tables() {
  const { posProfile } = usePOSStore();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [tablesCache, setTablesCache] = useState<Record<string, Table[]>>({});
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableOrdersList, setTableOrdersList] = useState<TableOrderSummary[]>([]);
  const [tableOrdersLoading, setTableOrdersLoading] = useState(false);
  const [order, setOrder] = useState<any | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [markingServed, setMarkingServed] = useState(false);
  const [freeingTable, setFreeingTable] = useState(false);

  const sortTables = (t: Table[]): Table[] => [...t].sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!posProfile?.branch) return;
    let cancelled = false;
    setLoadingRooms(true);
    const sessionKey = `ury_rooms_${posProfile.branch}`;
    const cached = sessionStorage.getItem(sessionKey);
    if (cached) {
      const parsed = JSON.parse(cached) as Room[];
      setRooms(parsed);
      if (parsed.length > 0) setSelectedRoom(parsed[0].name);
      setLoadingRooms(false);
      return;
    }
    getRooms(posProfile.branch)
      .then((fetched) => {
        if (!cancelled) {
          setRooms(fetched);
          if (fetched.length > 0) setSelectedRoom(fetched[0].name);
          sessionStorage.setItem(sessionKey, JSON.stringify(fetched));
        }
      })
      .finally(() => { if (!cancelled) setLoadingRooms(false); });
    return () => { cancelled = true; };
  }, [posProfile?.branch]);

  useEffect(() => {
    if (!selectedRoom) return;
    if (tablesCache[selectedRoom]) {
      setTables(sortTables(tablesCache[selectedRoom]));
      return;
    }
    setLoadingTables(true);
    getTables(selectedRoom)
      .then((fetched) => {
        const sorted = sortTables(fetched);
        setTables(sorted);
        setTablesCache((prev) => ({ ...prev, [selectedRoom!]: fetched }));
      })
      .finally(() => setLoadingTables(false));
  }, [selectedRoom]);

  // Load list of orders at the selected table (multiple orders per table)
  useEffect(() => {
    if (!selectedTable) {
      setTableOrdersList([]);
      setOrder(null);
      setSelectedInvoiceId(null);
      return;
    }
    setTableOrdersLoading(true);
    setTableOrdersList([]);
    setOrder(null);
    setSelectedInvoiceId(null);
    getTableOrders(selectedTable.name)
      .then((list) => setTableOrdersList(list))
      .finally(() => setTableOrdersLoading(false));
  }, [selectedTable?.name]);

  // When user selects an order from the list, load full order details
  const handleSelectOrder = (invoiceName: string) => {
    if (selectedInvoiceId === invoiceName) {
      setSelectedInvoiceId(null);
      setOrder(null);
      return;
    }
    setSelectedInvoiceId(invoiceName);
    setOrderLoading(true);
    getOrderByInvoiceId(invoiceName)
      .then((doc) => setOrder(doc))
      .finally(() => setOrderLoading(false));
  };

  const refreshTables = () => {
    if (selectedRoom && tablesCache[selectedRoom]) {
      getTables(selectedRoom).then((fetched) => {
        setTables(sortTables(fetched));
        setTablesCache((prev) => ({ ...prev, [selectedRoom]: fetched }));
      });
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentDialog(false);
    setOrder(null);
    setSelectedTable(null);
    refreshTables();
  };

  // getOrderByInvoiceId only returns draft (unpaid) orders, so any order we have here is payable
  const canPay = Boolean(order && order.name);
  const isUnpaidDraft = Boolean(order && order.name);
  const canMarkServed = isUnpaidDraft && !order?.customers_served;
  /** Free table only when there are no unpaid (draft) invoices at this table. */
  const canFreeTable = Boolean(selectedTable && selectedTable.occupied === 1 && tableOrdersList.length === 0);

  const handleMarkServed = async () => {
    if (!selectedTable || markingServed) return;
    setMarkingServed(true);
    try {
      await setCustomersServed(selectedTable.name);
      showToast.success('Table marked as served.');
      refreshTables();
      if (order) setOrder({ ...order, customers_served: 1 });
    } catch (e) {
      showToast.error(e instanceof Error ? e.message : 'Failed to mark as served');
    } finally {
      setMarkingServed(false);
    }
  };

  /** Free the table so it can be used again (after payment and/or served). */
  const handleFreeTable = async () => {
    if (!selectedTable || freeingTable) return;
    setFreeingTable(true);
    try {
      await freeTable(selectedTable.name);
      showToast.success(`${selectedTable.name} is now free.`);
      setOrder(null);
      setSelectedTable(null);
      refreshTables();
    } catch (e) {
      showToast.error(e instanceof Error ? e.message : 'Failed to free table');
    } finally {
      setFreeingTable(false);
    }
  };

  const getTableStatus = (table: Table) => {
    if (table.occupied !== 1) return { label: 'Free', className: 'bg-green-100 text-green-800' };
    if (table.customers_served === 1) return { label: 'Served', className: 'bg-blue-100 text-blue-800' };
    return { label: 'Occupied', className: 'bg-amber-100 text-amber-800' };
  };

  return (
    <div className="flex flex-1 bg-gray-100 min-h-0">
      {/* Left: rooms + tables - scrollable so no table is ever hidden */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-auto p-6 pr-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tables</h2>
        {loadingRooms ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
              <select
                className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                value={selectedRoom || ''}
                onChange={(e) => setSelectedRoom(e.target.value || null)}
              >
                {rooms.map((r) => (
                  <option key={r.name} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>
            {loadingTables ? (
              <Spinner />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 w-full">
                {tables.map((table) => {
                    const status = getTableStatus(table);
                    return (
                      <Card
                        key={table.name}
                        className={cn(
                          'cursor-pointer transition-shadow flex-shrink-0',
                          selectedTable?.name === table.name && 'ring-2 ring-blue-500 shadow-lg'
                        )}
                        onClick={() => setSelectedTable(table)}
                      >
                        <CardContent className="p-4 flex flex-col items-center">
                          <TableIcon type={table.table_shape} className="w-10 h-10 text-gray-500 mb-2" />
                          <span className="font-medium text-gray-900 text-sm">{table.name}</span>
                          <span className={cn('text-xs mt-1 px-2 py-0.5 rounded', status.className)}>
                            {status.label}
                          </span>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
          </>
        )}
      </div>

      {/* Right: order detail + payment — only show when a table is selected to use full width for grid when none selected */}
      {selectedTable && (
      <div className="w-96 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col min-h-0 h-full max-h-full">
        {tableOrdersLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner />
          </div>
        ) : tableOrdersList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-gray-700 font-medium mb-2">No order for {selectedTable.name}</p>
            <p className="text-sm text-gray-500 mb-4">Open POS to add or update this table&apos;s order.</p>
            <Button onClick={() => navigate('/')} className="mb-2">Go to POS</Button>
            {canFreeTable && (
              <Button variant="outline" onClick={handleFreeTable} disabled={freeingTable}>
                {freeingTable ? 'Freeing…' : 'Free table'}
              </Button>
            )}
          </div>
        ) : tableOrdersList.length > 0 && !selectedInvoiceId ? (
          <div className="flex-1 flex flex-col p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">Orders at {selectedTable.name}</p>
            <p className="text-xs text-gray-500 mb-2">Tap an order to view details, pay, or mark served.</p>
            <div className="space-y-2 overflow-y-auto">
              {tableOrdersList.map((inv) => (
                <button
                  key={inv.name}
                  type="button"
                  onClick={() => handleSelectOrder(inv.name)}
                  className="w-full text-left rounded-lg border-2 border-gray-200 hover:bg-gray-50 px-3 py-2 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-gray-900">{inv.customer_name || 'Customer'}</span>
                    <span className="text-blue-600 font-medium">{formatCurrency(inv.grand_total ?? inv.rounded_total ?? 0)}</span>
                  </div>
                  {inv.status && (
                    <span className="text-xs text-gray-500 mt-0.5 block">{inv.status === 'Draft' ? 'Unpaid' : inv.status}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Button onClick={() => navigate('/')} variant="outline" className="w-full">Go to POS</Button>
            </div>
          </div>
        ) : selectedInvoiceId && orderLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner />
          </div>
        ) : order && order.name ? (
          <>
            <div className="p-4 border-b border-gray-200">
              <Button
                variant="ghost"
                size="sm"
                className="mb-2 -ml-1 text-gray-600 hover:text-gray-900"
                onClick={() => { setSelectedInvoiceId(null); setOrder(null); }}
              >
                ← Back to orders list
              </Button>
              <h3 className="font-semibold text-gray-900">{order.name}</h3>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <User className="w-4 h-4" />
                <span>{order.customer_name || order.customer || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <Receipt className="w-4 h-4" />
                <span>Table {selectedTable.name}</span>
              </div>
              {order.posting_date && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                  <Clock className="w-4 h-4" />
                  <span>{order.posting_date} {order.posting_time || ''}</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {order.items && order.items.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Items</h4>
                  {order.items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span>{item.item_name || item.item_code}</span>
                      <span>{formatCurrency(item.amount ?? 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-2 flex-shrink-0">
              {canPay && (
                <Button
                  className="w-full"
                  onClick={() => setShowPaymentDialog(true)}
                >
                  Payment
                </Button>
              )}
              {canMarkServed && (
                <Button
                  variant="outline"
                  className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={handleMarkServed}
                  disabled={markingServed}
                >
                  {markingServed ? 'Updating…' : 'Mark as Served'}
                </Button>
              )}
              {canFreeTable && (
                <Button
                  variant="outline"
                  className="w-full border-green-300 text-green-700 hover:bg-green-50"
                  onClick={handleFreeTable}
                  disabled={freeingTable}
                >
                  {freeingTable ? 'Freeing…' : 'Free table'}
                </Button>
              )}
              <div className="flex justify-between text-lg font-semibold text-gray-900 pt-1">
                <span>Total</span>
                <span>{formatCurrency(order.rounded_total ?? order.grand_total ?? 0)}</span>
              </div>
            </div>
          </>
        ) : selectedInvoiceId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-gray-600 mb-2">Could not load order details.</p>
            <Button variant="outline" onClick={() => { setSelectedInvoiceId(null); setOrder(null); }}>Back to orders list</Button>
          </div>
        ) : null}
      </div>
      )}

      {showPaymentDialog && order && canPay && (
        <PaymentDialog
          onClose={() => setShowPaymentDialog(false)}
          grandTotal={order.grand_total ?? 0}
          roundedTotal={order.rounded_total ?? order.grand_total ?? 0}
          invoice={order.name}
          customer={order.customer_name || order.customer || ''}
          posProfile={posProfile?.name || ''}
          table={selectedTable?.name ?? null}
          cashier={posProfile?.cashier || ''}
          owner={posProfile?.cashier || ''}
          fetchOrders={async () => {}}
          clearSelectedOrder={handlePaymentSuccess}
          invoiceWaiter={(order as { waiter?: string }).waiter ?? null}
        />
      )}
    </div>
  );
}
