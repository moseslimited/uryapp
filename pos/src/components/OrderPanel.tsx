import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Edit, FrownIcon, Plus, Loader2, MessageSquare, Banknote, UserCheck, Gift } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { formatCurrency, cn } from '../lib/utils';
import { CustomerSelect } from './CustomerSelect';
import ProductDialog from './ProductDialog';
import OrderTypeSelect from './OrderTypeSelect';
import CommentDialog from './CommentDialog';
import PaymentDialog from './PaymentDialog';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { Select, SelectItem } from './ui';
import { syncOrder } from '../lib/order-api';
import { getWaiters, type WaiterOption } from '../lib/waiter-api';
import { useRootStore } from '../store/root-store';
import type { RootState } from '../store/root-store';
import { showToast } from './ui/toast';
import { DINE_IN } from '../data/order-types';

const OrderPanel = () => {
  const navigate = useNavigate();
  const { 
    activeOrders, 
    removeFromOrder, 
    updateQuantity, 
    clearOrder, 
    setSelectedItem,
    orderLoading,
    isOrderInteractionDisabled,
    isUpdatingOrder,
    posProfile,
    selectedOrderType,
    selectedTable,
    selectedRoom,
    selectedCustomer,
    selectedAggregator,
    resetOrderState,
    paymentModes,
    orderId,
    orderModifiedTime,
    orderComment,
    setOrderComment,
    tableOrdersList,
    tableOrdersLoading,
    clearTableOrder,
    loadOrderByInvoiceId,
    fetchTableOrders,
    tableOrder,
    toggleLineGiveaway,
  } = usePOSStore();
  const user = useRootStore((state: RootState) => state.user);
  const [editingItem, setEditingItem] = useState<typeof activeOrders[0] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [waiters, setWaiters] = useState<WaiterOption[]>([]);
  const [waitersLoading, setWaitersLoading] = useState(false);
  const [selectedWaiter, setSelectedWaiter] = useState<WaiterOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWaitersLoading(true);
    getWaiters()
      .then((list) => {
        if (!cancelled) {
          setWaiters(list);
          const current = list.find((w) => w.name === user?.name);
          setSelectedWaiter(current ?? (list[0] ?? null));
        }
      })
      .catch(() => {
        if (!cancelled) setWaiters([]);
      })
      .finally(() => {
        if (!cancelled) setWaitersLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.name]);

  const calculateItemTotal = (item: typeof activeOrders[0]) => {
    if (item.isGiveaway) return 0;
    const basePrice = item.selectedVariant?.price || item.price;
    const addonsTotal = item.selectedAddons?.reduce((sum, addon) => sum + addon.price, 0) || 0;
    return (basePrice + addonsTotal) * item.quantity;
  };

  const total = activeOrders.reduce(
    (sum, item) => sum + calculateItemTotal(item),
    0
  );

  const handleEdit = (item: typeof activeOrders[0]) => {
    const menuItem = {
      ...item,
      variants: item.variants,
      addons: item.addons,
    };
    setSelectedItem(menuItem);
    setEditingItem(item);
  };

  const handleCommentSave = (comment: string) => {
    setOrderComment(comment);
  };

  const handleSubmit = async () => {
    try {
      if (!posProfile) {
        throw new Error('POS Profile not found');
      }

      if (!user?.name) {
        throw new Error('User not logged in');
      }

      // Validate customer/aggregator details
      if (selectedOrderType === 'Aggregators') {
        if (!selectedAggregator?.customer) {
          showToast.error('Please select an aggregator before proceeding');
          return;
        }
      } else if (!selectedCustomer?.name) {
        showToast.error('Please select a customer before proceeding');
        return;
      }

      // Validate table selection for dine-in orders
      if (selectedOrderType === DINE_IN && !selectedTable) {
        showToast.error(`Please select a table for ${DINE_IN} orders`);
        return;
      }

      setIsSubmitting(true);
      
      const orderData = {
        items: activeOrders.map(item => ({
          item: item.id,
          item_name: item.name,
          rate: item.isGiveaway ? 0 : (item.selectedVariant?.price || item.price),
          qty: item.quantity,
          comment: item.comment || undefined,
          is_giveaway: item.isGiveaway ? true : undefined,
          included_modifiers: item.includedModifiers?.length
            ? item.includedModifiers.map((m) => ({
                item: m.item,
                item_name: m.item_name,
                qty_factor: m.qty_factor,
                group_id: m.group_id,
                group_label: m.group_label,
              }))
            : undefined,
        })),
        no_of_pax: 1,
        pos_profile: posProfile.name,
        order_type: selectedOrderType,
        table: selectedTable || undefined,
        room: selectedRoom || undefined,
        customer: selectedOrderType === 'Aggregators' ? selectedAggregator?.customer : selectedCustomer?.name,
        aggregator_id: selectedOrderType === 'Aggregators' ? selectedAggregator?.customer : undefined,
        cashier: posProfile.cashier,
        owner: user.name,
        mode_of_payment: paymentModes[0],
        last_invoice: isUpdatingOrder ? orderId : null,
        invoice: isUpdatingOrder ? orderId : null,
        last_modified_time: isUpdatingOrder && orderModifiedTime ? orderModifiedTime : undefined,
        waiter: selectedWaiter?.name ?? user.name,
        comments: orderComment || undefined
      };

      await syncOrder(orderData);
      showToast.success(isUpdatingOrder ? 'Order updated successfully' : 'Order created successfully');

      if (isUpdatingOrder) {
        const updatedOrderId = orderId;
        resetOrderState();
        navigate('/orders', { state: { selectedOrderId: updatedOrderId } });
        return;
      }

      if (selectedOrderType === DINE_IN && selectedTable) {
        clearTableOrder();
        fetchTableOrders(selectedTable);
      } else {
        resetOrderState();
      }
    } catch (error) {
      console.error('Failed to sync order:', error);
      // Frappe API error handling
      if (error && typeof error === 'object' && '_server_messages' in error && typeof (error as any)._server_messages === 'string') {
        try {
          const messages = JSON.parse((error as any)._server_messages);
          const messageObj = JSON.parse(messages[0]);
          showToast.error(messageObj.message || 'API error');
        } catch {
          showToast.error('API error');
        }
      } else if (error instanceof Error) {
        showToast.error(error.message);
      } else {
        showToast.error('Failed to process order');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const EmptyCartUI = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
        <FrownIcon className="w-12 h-12 text-gray-400" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Your cart is empty
      </h3>
      
      <p className="text-gray-500 text-sm mb-6 max-w-xs leading-relaxed">
        Add items to get started with your order
      </p>
      
      <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-lg">
        <Plus className="w-4 h-4" />
        <span className="text-sm font-medium">Click items to add them</span>
      </div>
      
      <div className="mt-4 text-xs text-gray-400">
        Double-click for customization options
      </div>
    </div>
  );

  const LoadingOrderUI = () => (
    <div className="h-96">
      <Spinner message="Loading order details..." />
    </div>
  );

  const isInteractionDisabled = isOrderInteractionDisabled() || isSubmitting;

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-[calc(100vh-4rem)] fixed right-0 z-10">
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <OrderTypeSelect disabled={isInteractionDisabled} />
        {selectedOrderType === DINE_IN && selectedTable && (
          <div className="mt-3 p-3 rounded-lg border-2 border-primary-200 bg-primary-50/50">
            <p className="text-sm font-semibold text-gray-800 mb-2">Orders at this table</p>
            {tableOrdersLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading orders…
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    clearTableOrder();
                    showToast.success('New order — add items below');
                  }}
                  disabled={isSubmitting}
                  className={cn(
                    'w-full rounded-lg border-2 px-3 py-2 text-sm font-medium text-left transition-colors flex items-center justify-between',
                    orderId === null
                      ? 'border-primary-500 bg-primary-100 text-primary-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-primary-300'
                  )}
                >
                  <span>+ New order</span>
                </button>
                {tableOrdersList.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-gray-500 pt-1">Existing orders — tap to update</p>
                    {tableOrdersList.map((inv) => (
                      <button
                        key={inv.name}
                        type="button"
                        onClick={() => loadOrderByInvoiceId(inv.name)}
                        disabled={isInteractionDisabled}
                        className={cn(
                          'w-full rounded-lg border-2 px-3 py-2 text-sm font-medium text-left transition-colors',
                          orderId === inv.name
                            ? 'border-primary-500 bg-primary-100 text-primary-800'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-primary-300'
                        )}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="truncate font-medium">{inv.customer_name || 'Customer'}</span>
                          <span className="text-primary-600 shrink-0">{formatCurrency(inv.grand_total ?? inv.rounded_total ?? 0)}</span>
                        </div>
                        {inv.status && (
                          <span className="text-xs text-gray-500 mt-0.5 block">{inv.status === 'Draft' ? 'Unpaid' : inv.status}</span>
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <div className="mt-3"><CustomerSelect disabled={isInteractionDisabled} /></div>
        <div className="mt-3">
          <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-1.5">
            <UserCheck className="w-3.5 h-3.5" />
            Waiter
          </label>
          <Select
            value={selectedWaiter?.name ?? ''}
            onValueChange={(value) => {
              const w = waiters.find((x) => x.name === value) ?? null;
              setSelectedWaiter(w);
            }}
            placeholder={waitersLoading ? 'Loading...' : 'Select waiter...'}
            disabled={waitersLoading || isInteractionDisabled}
          >
            {waiters.map((w) => (
              <SelectItem key={w.name} value={w.name}>
                {w.full_name || w.name}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>
      
      {orderLoading ? (
        <LoadingOrderUI />
      ) : activeOrders.length === 0 ? (
        <EmptyCartUI />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-6">
            {activeOrders.map((item) => (
              <div
                key={item.uniqueId}
                className={cn(
                  "flex flex-col py-4 border-b border-gray-100",
                  isInteractionDisabled && "opacity-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-gray-900 text-sm">{item.name}</h3>
                      {item.isGiveaway && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded">
                          Giveaway
                        </span>
                      )}
                    </div>
                    {item.selectedVariant && (
                      <p className="text-sm text-gray-600">{item.selectedVariant.name}</p>
                    )}
                    {item.includedModifiers && item.includedModifiers.length > 0 && (
                      <p className="text-xs text-gray-500">
                        Included: {item.includedModifiers.map((m) => m.item_name || m.item).join(', ')}
                      </p>
                    )}
                    {item.selectedAddons && item.selectedAddons.length > 0 && (
                      <p className="text-sm text-gray-500">
                        {item.selectedAddons.map(addon => addon.name).join(', ')}
                      </p>
                    )}
                    <p className="text-gray-600 text-sm">{formatCurrency(calculateItemTotal(item))}</p>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => item.uniqueId && toggleLineGiveaway(item.uniqueId)}
                      variant="ghost"
                      size="icon"
                      className={cn(
                        item.isGiveaway ? 'text-amber-600 hover:text-amber-700' : 'text-gray-400 hover:text-amber-600'
                      )}
                      title={item.isGiveaway ? 'Remove giveaway (charge normal price)' : 'Mark as giveaway (free line)'}
                      disabled={isInteractionDisabled || !item.uniqueId}
                    >
                      <Gift className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => handleEdit(item)}
                      variant="ghost"
                      size="icon"
                      className="text-blue-600 hover:text-blue-700"
                      title="Edit item"
                      disabled={isInteractionDisabled}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => {
                          const newQuantity = Math.max(0, item.quantity - 1);
                          if (newQuantity === 0) {
                            removeFromOrder(item.uniqueId!);
                          } else {
                            updateQuantity(item.uniqueId!, newQuantity);
                          }
                        }}
                        variant="outline"
                        size="icon"
                        className="w-8 h-8 rounded-full"
                        disabled={isInteractionDisabled}
                      >
                        -
                      </Button>
                      <span className="w-6 text-center">{item.quantity}</span>
                      <Button
                        onClick={() => updateQuantity(item.uniqueId!, item.quantity + 1)}
                        variant="outline"
                        size="icon"
                        className="w-8 h-8 rounded-full"
                        disabled={isInteractionDisabled}
                      >
                        +
                      </Button>
                    </div>
                    
                    <Button
                      onClick={() => removeFromOrder(item.uniqueId!)}
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-600"
                      disabled={isInteractionDisabled}
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {activeOrders.length > 0 && (
              <Button
                onClick={clearOrder}
                variant="ghost"
                size="sm"
                className="w-full text-gray-600 hover:text-gray-800 mt-4"
                disabled={isInteractionDisabled}
              >
                Clear cart
              </Button>
            )}
          </div>
          
          <div className="p-4 border-t border-gray-200 flex-shrink-0 bg-white">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowCommentDialog(true)}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    orderComment ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
                  )}
                  disabled={isInteractionDisabled}
                  title={orderComment ? "Edit comment" : "Add comment"}
                >
                  <MessageSquare className="w-4 h-4" />
                </Button>
                <span className="text-lg font-semibold">Total</span>
              </div>
              <span className="text-lg font-semibold">{formatCurrency(total)}</span>
            </div>
            {isUpdatingOrder && orderId && (
              <Button
                onClick={() => setShowPaymentDialog(true)}
                variant="outline"
                size="default"
                className="w-full mb-2"
                disabled={isInteractionDisabled}
              >
                <Banknote className="w-4 h-4 mr-2" />
                Payment
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              variant="default"
              size="default"
              className="w-full"
              disabled={isInteractionDisabled}
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isUpdatingOrder ? 'Updating Order...' : 'Processing Order...'}
                </div>
              ) : isUpdatingOrder ? (
                'Update Order'
              ) : (
                'Add New Order'
              )}
            </Button>
          </div>
        </>
      )}

      {editingItem && (
        <ProductDialog
          onClose={() => {
            setEditingItem(null);
            setSelectedItem(null);
          }}
          editMode
          initialVariant={editingItem.selectedVariant}
          initialAddons={editingItem.selectedAddons}
          initialQuantity={editingItem.quantity}
          initialPrice={editingItem.selectedVariant?.price ?? editingItem.price}
          itemToReplace={editingItem}
        />
      )}

      <CommentDialog
        isOpen={showCommentDialog}
        onClose={() => setShowCommentDialog(false)}
        onSave={handleCommentSave}
        initialComment={orderComment}
      />

      {showPaymentDialog && orderId && (
        <PaymentDialog
          onClose={() => setShowPaymentDialog(false)}
          grandTotal={tableOrder?.message?.grand_total ?? total}
          roundedTotal={tableOrder?.message?.rounded_total ?? total}
          invoice={orderId}
          customer={selectedCustomer?.name ?? ''}
          posProfile={posProfile?.name ?? ''}
          table={selectedTable}
          cashier={posProfile?.cashier ?? ''}
          owner={user?.name ?? posProfile?.cashier ?? ''}
          fetchOrders={async () => { if (selectedTable) await fetchTableOrders(selectedTable); }}
          clearSelectedOrder={() => {
            clearTableOrder();
            setShowPaymentDialog(false);
            if (selectedTable) fetchTableOrders(selectedTable);
          }}
          items={activeOrders.map(item => {
            const rate = item.selectedVariant?.price ?? item.price;
            const addonsTotal = item.selectedAddons?.reduce((s, a) => s + a.price, 0) ?? 0;
            const lineTotal = (rate + addonsTotal) * item.quantity;
            return {
              item_name: item.name,
              qty: item.quantity,
              rate: rate + addonsTotal,
              amount: lineTotal,
            };
          })}
          invoiceWaiter={selectedWaiter?.name ?? user?.name ?? null}
        />
      )}
    </div>
  );
};

export default OrderPanel; 