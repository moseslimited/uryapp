import React, { useState, useEffect, useCallback } from 'react';
import POSOpeningDialog from './POSOpeningDialog';
import { checkPOSOpening } from '../lib/pos-opening-api';
import { Spinner } from './ui/spinner';

interface POSOpeningProviderProps {
  children: React.ReactNode;
}

/**
 * Blocks the POS app until the branch has an open POS Opening Entry (server: posOpening → 0).
 * Shows POSOpeningDialog with Open POS Opening Entry / Reload only.
 */
const POSOpeningProvider = ({ children }: POSOpeningProviderProps) => {
  const [loading, setLoading] = useState(true);
  const [posIsOpen, setPosIsOpen] = useState(false);

  const refreshOpeningStatus = useCallback(async () => {
    try {
      const res = await checkPOSOpening();
      // API: 0 = at least one Open + submitted POS Opening Entry for branch; 1 = none
      setPosIsOpen(res?.message === 0);
    } catch {
      setPosIsOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshOpeningStatus();
  }, [refreshOpeningStatus]);

  const handleReload = () => {
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-100">
        <Spinner message="Checking POS session…" />
      </div>
    );
  }

  if (!posIsOpen) {
    return (
      <POSOpeningDialog onReload={handleReload} type="opening" />
    );
  }

  return <>{children}</>;
};

export default POSOpeningProvider;
