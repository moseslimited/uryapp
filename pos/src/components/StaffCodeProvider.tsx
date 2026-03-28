import React from 'react';

interface Props {
  children: React.ReactNode;
}

/** Staff code was removed; this provider now only renders children. */
const StaffCodeProvider: React.FC<Props> = ({ children }) => {
  return <>{children}</>;
};

export default StaffCodeProvider;
