import React from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { useRootStore } from '../store/root-store';

interface Props {
  children: React.ReactNode;
}

/** Wraps routes that require accounts/manager access. Redirects to /pos/orders if user cannot access. */
const AccountsRouteGuard: React.FC<Props> = ({ children }) => {
  const location = useLocation();
  const user = useRootStore((s) => s.user);

  const allowedRoles = ['Administrator', 'System Manager', 'Accounts Manager', 'Accounts User', 'URY Manager'];
  const canAccess = user?.roles?.some((r: string) => allowedRoles.includes(r)) ?? false;

  if (user && !canAccess) {
    return <Navigate to="/pos/orders" state={{ from: location }} replace />;
  }
  return <>{children}</>;
};

export default AccountsRouteGuard;
