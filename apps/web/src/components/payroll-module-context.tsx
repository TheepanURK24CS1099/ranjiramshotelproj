"use client";

import { createContext, useContext } from "react";

type PayrollModuleContextValue = {
  payrollEnabled: boolean;
  setPayrollEnabled: (enabled: boolean) => void;
};

const PayrollModuleContext = createContext<PayrollModuleContextValue | null>(null);

export function PayrollModuleProvider({ children, value }: { children: React.ReactNode; value: PayrollModuleContextValue }) {
  return <PayrollModuleContext.Provider value={value}>{children}</PayrollModuleContext.Provider>;
}

export function usePayrollModule() {
  const context = useContext(PayrollModuleContext);
  if (!context) throw new Error("usePayrollModule must be used inside PayrollModuleProvider");
  return context;
}
