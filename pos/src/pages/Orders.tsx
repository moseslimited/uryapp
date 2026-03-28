import React, { useEffect, useRef } from 'react';
import { Clock, User, UserCheck, Receipt, Printer, Pencil, X, RotateCcw } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '../components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { showToast } from '../components/ui/toast';
import OrderStatusSidebar from '../components/OrderStatusSidebar';
import { useRootStore } from '../store/root-store';
import { formatCurrency, getFrappeErrorMessage } from '../lib/utils';
import { Spinner } from '../components/ui/spinner';
import { Textarea } from '../components/ui/textarea';
import { usePOSStore } from '../store/pos-store';
import { useNavigate, useLocation } from 'react-router-dom';
import PaymentDialog from '../components/PaymentDialog';
import { openPrintWindow } from '../lib/print';
import { call } from '../lib/frappe-sdk';
import { createPosReturn } from '../lib/invoice-api';

export default function Orders() {
  const { 
    orders,
    orderLoading,
    error,
    selectedStatus,
    pagination,
    selectedOrder,
    selectedOrderItems,
    selectedOrderTaxes,
    selectedOrderLoading,
    selectedOrderError,
    fetchOrders,
    setSelectedStatus,
    goToNextPage,
    goToPreviousPage,
    selectOrder,
    clearSelectedOrder,
    orderSearchQuery
  } = useRootStore();

  const posStore = usePOSStore();
  const navigate = useNavigate();
  const location = useLocation();
  const mounted = useRef(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelLoading, setCancelLoading] = React.useState(false);
  const [editLoading, setEditLoading] = React.useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = React.useState(false);
  const [isPrinting, setIsPrinting] = React.useState(false);
  const [refundLoading, setRefundLoading] = React.useState(false);
  /**
   * Must be a ref (not useState): clearSelectedOrder() updates Zustand synchronously and can
   * re-render before React flushes setState, so the auto-select effect would run with a stale
   * "dismissed" flag and immediately re-pick the first order — Pay Later looked like a no-op.
   */
  const suppressAutoSelectRef = useRef(false);
  /** Shown in empty detail panel after Pay Later so users know the invoice was not removed */
  const [payLaterDismissedOrderId, setPayLaterDismissedOrderId] = React.useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return; // Skip the first run
    }
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSearchQuery]);

  // After updating an order, open that order in the detail panel when we land on /orders
  const selectedOrderIdFromState = (location.state as { selectedOrderId?: string } | null)?.selectedOrderId;
  useEffect(() => {
    if (!selectedOrderIdFromState || !orders?.length) return;
    const order = orders.find((o: { name: string }) => o.name === selectedOrderIdFromState);
    if (order) {
      suppressAutoSelectRef.current = false;
      setPayLaterDismissedOrderId(null);
      selectOrder(order);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [selectedOrderIdFromState, orders, selectOrder, navigate, location.pathname]);

  // Changing status/filter should allow auto-select again
  useEffect(() => {
    suppressAutoSelectRef.current = false;
    setPayLaterDismissedOrderId(null);
  }, [selectedStatus]);

  // Auto-select first order when list loads and none selected, so Pay/Payment button is visible for unpaid invoices
  useEffect(() => {
    if (
      !orderLoading &&
      orders?.length > 0 &&
      !selectedOrder &&
      !selectedOrderIdFromState &&
      !suppressAutoSelectRef.current
    ) {
      selectOrder(orders[0]);
    }
  }, [orderLoading, orders, selectedOrder, selectedOrderIdFromState, selectOrder]);


  // Function to format the date and time
  const formatDateTime = (date: string, time: string) => {
    const formattedDate = new Date(date + ' ' + time).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
    return formattedDate;
  };

  const handleOrderClick = (order: any) => {
    suppressAutoSelectRef.current = false;
    setPayLaterDismissedOrderId(null);
    selectOrder(order);
  };

  // Display label: Draft is shown as Unpaid in the UI
  const getStatusLabel = (status: string) => (status === 'Draft' ? 'Unpaid' : status);

  // Helper function to get badge variant based on order status
  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'secondary';
      case 'Recently Paid':
      case 'Paid':
      case 'Pay Later':
      case 'Consolidated':
        return 'default';
      case 'Return':
        return 'destructive';
      default:
        return 'default';
    }
  };

  async function handleCancelOrder() {
    if (!selectedOrder) return;
    if (!cancelReason.trim()) {
      showToast.error('Please enter a reason for cancellation.');
      return;
    }
    setCancelLoading(true);
    try {
      await call.post('ury.ury.doctype.ury_order.ury_order.cancel_order', {
        invoice_id: selectedOrder.name,
        reason: cancelReason
      })
      showToast.success('Order cancelled successfully');
      setCancelDialogOpen(false);
      setCancelReason('');
      clearSelectedOrder();
      fetchOrders();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Failed to cancel order');
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleRefundOrder() {
    if (!selectedOrder) return;
    const currentOrder = orders.find((o) => o.name === selectedOrder.name);
    if (!currentOrder) {
      showToast.error('Order list changed. Refreshing orders and retry.');
      clearSelectedOrder();
      await fetchOrders();
      return;
    }
    setRefundLoading(true);
    try {
      const res = await createPosReturn(currentOrder.name);
      showToast.success(res.message || 'Return created');
      clearSelectedOrder();
      fetchOrders();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create return';
      showToast.error(message);
      if (message.toLowerCase().includes('not found') || message.toLowerCase().includes('refresh orders')) {
        clearSelectedOrder();
        fetchOrders();
      }
    } finally {
      setRefundLoading(false);
    }
  }

  async function handleEditOrder() {
    if (!selectedOrder) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/method/frappe.client.get?doctype=POS+Invoice&name=${selectedOrder.name}`);
      if (!res.ok) throw new Error('Failed to fetch order details');
      const data = await res.json();
      const order = data.message;
      // Fill POS store (setOrderForUpdate before setSelectedTable so we can pass preserveOrderForUpdate and keep orderId)
      posStore.resetOrderState();
      posStore.setSelectedOrderType(order.order_type);
      posStore.setOrderForUpdate(order.name, order.modified ?? undefined);
      if (order.restaurant_table) {
        posStore.setSelectedTable(order.restaurant_table, order.custom_restaurant_room || null, true);
      }
      posStore.setSelectedCustomer({ id: order.customer, name: order.customer_name, phone: order.mobile_number });
      // Load menu before navigating so POS items are clickable (not stuck on menuLoading)
      await posStore.fetchMenuItems();
      // Fill cart
      const items = (order.items || []).map((item: any) => ({
        id: item.item_code,
        name: item.item_name,
        price: item.rate,
        quantity: item.qty,
        amount: item.amount,
        image: item.image || null,
        uniqueId: item.name,
        item: item.item_code,
        item_name: item.item_name,
        item_image: null,
        course: '',
        description: item.description || '',
        special_dish: 0,
        tax_rate: 0,
      }));
      for (const cartItem of items) {
        await posStore.addToOrder(cartItem);
      }
      // Redirect to POS page
      navigate('/');
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Failed to edit order');
    } finally {
      setEditLoading(false);
    }
  }

  async function handlePrintOrder() {
    if (!selectedOrder || !posStore.posProfile) return;
    setIsPrinting(true);
    try {
      await openPrintWindow(selectedOrder.name, posStore.posProfile.print_format ?? 'POS Receipt');
      showToast.success('Print window opened. Use Print or Save as PDF in the dialog.');
    } catch (err: any) {
      showToast.error('Print failed: ' + (err?.message || err));
    } finally {
      setIsPrinting(false);
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-xl font-semibold text-red-600 mb-2">Failed to load orders</p>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Sidebar - Order Types */}
      <OrderStatusSidebar
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
      />

      {/* Middle Section - Order Cards */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden pr-96">
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 pb-40">
          {orderLoading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center mt-10">
              <p className="text-gray-500">No orders found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-screen-xl mx-auto">
              {orders.map((order) => (
                <Card 
                  key={order.name} 
                  className={`p-0 bg-white hover:shadow-md transition-shadow flex flex-col overflow-hidden cursor-pointer ${
                    selectedOrder?.name === order.name ? 'ring-2 ring-blue-500 shadow-lg' : ''
                  }`}
                  onClick={() => handleOrderClick(order)}
                >
                  <CardContent className="p-0 flex flex-col h-full">
                    <div className="p-3 bg-gray-50 border-b">
                    <h3 className="font-medium text-gray-900 text-sm truncate" title={order.name}>
                      {order.name}
                    </h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">
                          {order.restaurant_table ? `Table ${order.restaurant_table} • ` : ''}{order.order_type}
                        </p>
                      </div>
                      <Badge variant={getBadgeVariant(order.status)} className="ml-2">
                        {getStatusLabel(order.status)}
                      </Badge>
                    </div>
                    </div>

                    {/* Content section - matches MenuCard padding and structure */}
                    <div className="flex-1 p-3 flex flex-col">
                      <div className="">
                        <p className="text-sm text-gray-900">{order.customer}</p>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatDateTime(order.posting_date, order.posting_time)}</span>
                      </div>

                      {/* Total - pushed to bottom like MenuCard */}
                      <div className="mt-auto pt-2">
                        <span className="text-sm font-semibold text-gray-900 tabular-nums">
                          {formatCurrency(order.rounded_total)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {/* Pagination Controls */}
          {!orderLoading && (
            <div className="py-4">
              <div className="flex justify-center items-center gap-x-4 max-w-screen-xl mx-auto">
                <Button
                  onClick={goToPreviousPage}
                  disabled={pagination.currentPage === 1}
                  variant="outline"
                  className='w-20'
                  size="xs"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Page {pagination.currentPage}
                  </span>
                </div>
                <Button
                  onClick={goToNextPage}
                  disabled={!pagination.hasNextPage}
                  variant="outline"
                  className='w-20'
                  size="xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Section - Order Details */}
      <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-[calc(100vh-4rem)] fixed right-0 z-10">
        {!selectedOrder ? (
          <div className="text-center h-full flex flex-col items-center justify-center text-gray-500 p-6">
            <p className="text-lg font-medium mb-2">Select an order to view details</p>
            <p className="text-sm">Click on any order card to view its details</p>
            {payLaterDismissedOrderId && (
              <div
                className="mt-6 w-full max-w-sm text-left rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                role="status"
              >
                <p className="font-medium text-amber-900">Pay Later</p>
                <p className="mt-1 text-amber-900/90">
                  <span className="font-mono">{payLaterDismissedOrderId}</span> is still{' '}
                  <strong>unpaid</strong> and remains in this list. Tap the card again when you want to
                  pay or edit.
                </p>
              </div>
            )}
          </div>
        ) : selectedOrderLoading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        ) : selectedOrderError ? (
          <div className="text-center h-full flex flex-col items-center justify-center text-red-500 p-6">
            <p className="text-lg font-medium mb-2">Failed to load order details</p>
            <p className="text-sm">{selectedOrderError}</p>
          </div>
        ) : (
          <>
            {/* Fixed Header */}
            <div className="sticky top-0 left-0 right-0 z-20 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between min-h-[64px]">
              <h2 className="text-xl font-semibold text-gray-900 truncate max-w-[10rem]">{selectedOrder.name}</h2>
              <div className="flex items-center gap-2">
                {/* Only show edit and cancel buttons for unpaid orders */}
                {(selectedOrder.status === 'Draft' || selectedOrder.status === 'Recently Paid' || selectedOrder.status === 'Pay Later' || (selectedOrder as { status?: string }).status === 'Unpaid') && (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label="Edit order"
                      onClick={handleEditOrder}
                      disabled={editLoading}
                    >
                      <Pencil className="w-4 h-4" />
                      {editLoading && <span className="ml-2 text-xs">Loading...</span>}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md p-2 bg-gray-100 hover:bg-gray-200 text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                      aria-label="Cancel order"
                      onClick={() => setCancelDialogOpen(true)}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
                {(selectedOrder.status === 'Paid' || selectedOrder.status === 'Consolidated') && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md p-2 bg-amber-50 hover:bg-amber-100 text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    aria-label="Refund / Return"
                    onClick={handleRefundOrder}
                    disabled={refundLoading}
                  >
                    <RotateCcw className="w-4 h-4" />
                    {refundLoading ? <span className="ml-2 text-xs">Creating...</span> : null}
                  </button>
                )}
                <Badge variant={getBadgeVariant(selectedOrder.status)}>
                  {getStatusLabel(selectedOrder.status)}
                </Badge>
              </div>
            </div>
            {/* Cancel Order Dialog */}
            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancel Order</DialogTitle>
                  <DialogDescription>
                    Please provide a reason for cancelling this order.
                  </DialogDescription>
                </DialogHeader>
                <div className="px-6 mb-3">
                <Textarea
                  placeholder="Enter cancel reason"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  disabled={cancelLoading}
                  autoFocus
                />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelLoading}>
                    Close
                  </Button>
                  <Button variant="danger" onClick={handleCancelOrder} disabled={cancelLoading}>
                    {cancelLoading ? 'Cancelling...' : 'Confirm Cancel'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-6 pb-40">
              {/* Order Header (now only info, not name/buttons) */}
              <div className="mb-6">
                {/* Two-column Order Info */}
                <div className="grid grid-cols-2 gap-4">
                  {/* First column: customer and time */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-900 font-medium">{selectedOrder.customer}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-600">{formatDateTime(selectedOrder.posting_date, selectedOrder.posting_time)}</span>
                    </div>
                  </div>
                  {/* Second column: waiter and table */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <UserCheck className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-600">{selectedOrder.waiter}</span>
                    </div>
                    {selectedOrder.restaurant_table && (
                      <div className="flex items-center gap-3 text-sm">
                        <Receipt className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-600">{selectedOrder.restaurant_table}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h3>
                <div className="space-y-3">
                  {selectedOrderItems.map((item, index) => (
                    <div key={index} className="flex justify-between items-start py-2 border-b border-gray-100">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                        <p className="text-xs text-gray-500">Qty: {item.qty}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCurrency(item.amount)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Taxes */}
              {selectedOrderTaxes.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Taxes & Charges</h3>
                  <div className="space-y-2">
                    {selectedOrderTaxes.map((tax, index) => (
                      <div key={index} className="flex justify-between items-center py-1">
                        <span className="text-sm text-gray-600">{tax.description}</span>
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(tax.rate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Bottom Section - Single Row: Print | Payment | Total */}
            <div className="border-t border-gray-200 p-6 bg-gray-50 sticky bottom-0 left-0 right-0 z-10">
              <div className="flex items-center gap-3 w-full relative">
                {/* Print Icon Button */}
                <Button
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={handlePrintOrder}
                  aria-label="Print"
                  disabled={isPrinting}
                >
                  {isPrinting ? <Spinner className="w-5 h-5" hideMessage /> : <Printer className="w-5 h-5" />}
                </Button>
                {/* Pay / Pay Later - show for unpaid orders (Draft, Recently Paid, or Unpaid from API) */}
                {(selectedOrder.status === 'Draft' || selectedOrder.status === 'Recently Paid' || selectedOrder.status === 'Pay Later' || (selectedOrder as { status?: string }).status === 'Unpaid') && (
                  <>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        if (String(selectedOrder.invoice_printed) === '0') {
                          showToast.info('Payment recorded without printing the receipt.');
                        }
                        setShowPaymentDialog(true);
                      }}
                    >
                      Pay
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-shrink-0 relative z-20"
                      type="button"
                      onClick={async () => {
                        const id = selectedOrder?.name ?? null;
                        if (!id) return;
                        try {
                          await call.post('ury.ury_pos.api.mark_pos_invoice_pay_later', { invoice_name: id });
                          suppressAutoSelectRef.current = true;
                          setShowPaymentDialog(false);
                          setPayLaterDismissedOrderId(id);
                          clearSelectedOrder();
                          await fetchOrders();
                          showToast.success('Moved to Pay Later. It is now listed under Parties for that customer.');
                        } catch (e: unknown) {
                          showToast.error(getFrappeErrorMessage(e));
                        }
                      }}
                    >
                      Pay Later
                    </Button>
                  </>
                )}
                {/* Total */}
                <span className="ml-auto text-xl font-bold text-gray-900 whitespace-nowrap">
                  {formatCurrency(selectedOrder.rounded_total)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
      {showPaymentDialog && selectedOrder && (
        <PaymentDialog
          onClose={() => setShowPaymentDialog(false)}
          grandTotal={selectedOrder.grand_total}
          roundedTotal={selectedOrder.rounded_total}
          invoice={selectedOrder.name}
          customer={selectedOrder.customer}
          posProfile={posStore.posProfile?.name || ''}
          table={selectedOrder.restaurant_table || null}
          cashier={posStore.posProfile?.cashier || ''}
          owner={posStore.posProfile?.cashier || ''}
          fetchOrders={fetchOrders}
          clearSelectedOrder={clearSelectedOrder}
          items={selectedOrderItems.map(item => ({
            item_name: item.item_name,
            qty: item.qty,
            rate: item.qty ? item.amount / item.qty : 0,
            amount: item.amount,
          }))}
          invoiceWaiter={selectedOrder.waiter ?? null}
        />
      )}
    </div>
  );
};
