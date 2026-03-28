import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';
import Orders from './pages/Orders';
import POS from './pages/POS';
import Tables from './pages/Tables';
import Items from './pages/Items';
import RawMaterials from './pages/RawMaterials';
import Reports from './pages/Reports';
import DailyClosings from './pages/DailyClosings';
import Wastage from './pages/Wastage';
import Purchases from './pages/Purchases';
import Expenses from './pages/Expenses';
import Accounts from './pages/Accounts';
import ProfitLoss from './pages/ProfitLoss';
import Parties from './pages/Parties';
import StockTransfer from './pages/StockTransfer';
import AuthGuard from './components/AuthGuard';
import AccountsRouteGuard from './components/AccountsRouteGuard';
import POSOpeningProvider from './components/POSOpeningProvider';
import StaffCodeProvider from './components/StaffCodeProvider';
import ScreenSizeProvider from './components/ScreenSizeProvider';
import { ToastProvider } from './components/ui/toast';
import { usePOSStore } from './store/pos-store';
import { useEffect } from 'react';

function App() {
  const {
    initializeApp
  } = usePOSStore();
  
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  // Match Desk: favicon from Website Settings (injected in pos.py boot as favicon_url).
  useEffect(() => {
    const href = (window as unknown as { frappe?: { boot?: { favicon_url?: string } } }).frappe?.boot
      ?.favicon_url;
    if (!href || typeof href !== 'string') return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }, []);
  return (
    <>
      <ToastProvider />
      <ScreenSizeProvider>
        <AuthGuard>
          <POSOpeningProvider>
            <StaffCodeProvider>
              <Router basename="/pos">
                <div className="flex flex-col h-screen bg-gray-100 font-inter">
                  <Header />
                  <div className="flex-1 overflow-hidden">
                    <Routes>
                      <Route path="/" element={<POS/>} />
                      <Route path="/orders" element={<Orders />} />
                      <Route path="/tables" element={<Tables />} />
                      <Route path="/items" element={<AccountsRouteGuard><Items /></AccountsRouteGuard>} />
                      <Route path="/raw-materials" element={<AccountsRouteGuard><RawMaterials /></AccountsRouteGuard>} />
                      <Route path="/reports" element={<AccountsRouteGuard><Reports /></AccountsRouteGuard>} />
                      <Route path="/daily-closings" element={<AccountsRouteGuard><DailyClosings /></AccountsRouteGuard>} />
                      <Route path="/wastage" element={<AccountsRouteGuard><Wastage /></AccountsRouteGuard>} />
                      <Route path="/purchases" element={<AccountsRouteGuard><Purchases /></AccountsRouteGuard>} />
                      <Route path="/expenses" element={<AccountsRouteGuard><Expenses /></AccountsRouteGuard>} />
                      <Route path="/accounts" element={<AccountsRouteGuard><Accounts /></AccountsRouteGuard>} />
                      <Route path="/parties" element={<AccountsRouteGuard><Parties /></AccountsRouteGuard>} />
                      <Route path="/stock-transfer" element={<AccountsRouteGuard><StockTransfer /></AccountsRouteGuard>} />
                      <Route path="/profit-loss" element={<AccountsRouteGuard><ProfitLoss /></AccountsRouteGuard>} />
                    </Routes>
                  </div>
                  <Footer />
                </div>
              </Router>
            </StaffCodeProvider>
          </POSOpeningProvider>
        </AuthGuard>
      </ScreenSizeProvider>
    </>
  );
}

export default App;
