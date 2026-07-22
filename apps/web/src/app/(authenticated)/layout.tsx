"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { PayrollModuleProvider } from "@/components/payroll-module-context";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Record<string, string> | null>(null);
  const [payrollEnabled, setPayrollEnabled] = useState(true);

  useEffect(() => {
    Promise.all([apiClient.get("/auth/me"), apiClient.get("/settings/modules")])
      .then(([data, modules]) => { setUser(data as Record<string, string>); setPayrollEnabled(Boolean((modules as { enabled?: boolean }).enabled)); })
      .catch(() => router.push("/login"));
  }, [router]);

  const handleLogout = async () => {
    try {
      await apiClient.post("/auth/logout", {});
    } finally {
      router.push("/login");
    }
  };

  if (!user) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <PayrollModuleProvider value={{ payrollEnabled, setPayrollEnabled }}><div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-gray-700">Hotel Admin</div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard" className="block px-4 py-2 rounded hover:bg-gray-700">Dashboard</Link>
          <Link href="/attendance" className="block px-4 py-2 rounded hover:bg-gray-700">Attendance</Link>
          <Link href="/reports" className="block px-4 py-2 rounded hover:bg-gray-700">Reports</Link>
          <Link href="/employees" className="block px-4 py-2 rounded hover:bg-gray-700">Employees</Link>
          <Link href="/shifts" className="block px-4 py-2 rounded hover:bg-gray-700">Shifts</Link>
          <Link href="/holidays" className="block px-4 py-2 rounded hover:bg-gray-700">Holidays</Link>
          {payrollEnabled && <Link href="/payroll" className="block px-4 py-2 rounded hover:bg-gray-700">Payroll</Link>}
          {user.role === "ADMIN" && <Link href="/settings" className="block px-4 py-2 rounded hover:bg-gray-700">Settings</Link>}
          <Link href="/devices" className="block px-4 py-2 rounded hover:bg-gray-700">Biometric Device</Link>
        </nav>
        <div className="p-4 border-t border-gray-700">
          <div className="text-sm text-gray-400 mb-2">{user.email} ({user.role})</div>
          <button 
            onClick={handleLogout}
            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6">
          {children}
        </main>
      </div>
    </div></PayrollModuleProvider>
  );
}
