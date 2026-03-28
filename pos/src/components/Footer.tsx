import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutGrid, 
  ClipboardList,
  Table as TableIcon,
  Package,
  Box,
  BarChart3,
  CalendarCheck,
  Trash2,
  ShoppingCart,
  Wallet,
  BookOpen,
  FileText,
  Users,
  ArrowRightLeft,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import PaymentDialog from './PaymentDialog';

const BASE_TABS = [
  { icon: LayoutGrid, label: 'POS', path: '/' },
  { icon: ClipboardList, label: 'Orders', path: '/orders' },
  { icon: TableIcon, label: 'Tables', path: '/tables' },
];

const EXTRA_TABS = [
  { icon: Package, label: 'Items', path: '/items' },
  { icon: Box, label: 'Raw materials', path: '/raw-materials' },
  { icon: BarChart3, label: 'Reports', path: '/reports' },
  { icon: CalendarCheck, label: 'Daily closings', path: '/daily-closings' },
  { icon: Trash2, label: 'Wastage', path: '/wastage' },
  { icon: ShoppingCart, label: 'Purchases', path: '/purchases' },
  { icon: Wallet, label: 'Expenses', path: '/expenses' },
  { icon: BookOpen, label: 'Accounts', path: '/accounts' },
  { icon: Users, label: 'Parties', path: '/parties' },
  { icon: ArrowRightLeft, label: 'Stock', path: '/stock-transfer' },
  { icon: FileText, label: 'P&L', path: '/profit-loss' },
];

const ROLES_CAN_SEE_ALL_TABS = ['Accounts Manager', 'Accounts User'];

const Footer = () => {
  const { activeOrders } = usePOSStore();
  const user = useRootStore((s) => s.user);
  const [showPayment, setShowPayment] = useState(false);
  const canSeeAllTabs = Boolean(
    user?.roles?.some((r) => ROLES_CAN_SEE_ALL_TABS.includes(r))
  );
  const navItems = canSeeAllTabs ? [...BASE_TABS, ...EXTRA_TABS] : BASE_TABS;

  const total = activeOrders.reduce((sum, item) => {
    const basePrice = item.selectedVariant?.price || item.price;
    const addonsTotal = item.selectedAddons?.reduce((sum, addon) => sum + addon.price, 0) || 0;
    return sum + (basePrice + addonsTotal) * item.quantity;
  }, 0);

  return (
    <div className="bg-white border-t border-gray-200 py-2 relative">
      <nav
        className="w-full overflow-x-auto overflow-y-hidden scroll-smooth pl-64 pr-2"
        aria-label="POS navigation"
      >
        <div className="flex justify-start items-center gap-2 min-w-max py-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0',
                  isActive && 'text-blue-600'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs mt-1 whitespace-nowrap">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      
      {showPayment && (
        <PaymentDialog
          onClose={() => setShowPayment(false)}
          totalAmount={total}
        />
      )}
    </div>
  );
};

export default Footer; 