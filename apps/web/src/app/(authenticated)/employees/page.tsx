"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

export default function EmployeesListPage() {
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);

  const fetchEmployees = async () => {
    try {
      let url = `/employees?page=${page}&limit=20`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (activeFilter === "active") url += "&active=true";
      if (activeFilter === "inactive") url += "&active=false";

      const data = await apiClient.get(url);
      setEmployees(data.data);
      setTotal(data.total);
    } catch (e: unknown) {
      console.error(e);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- We need to fetch data on mount and filter changes
    fetchEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeFilter, search]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <Link href="/employees/new" className="px-4 py-2 bg-[#028174] text-white rounded hover:bg-[#026c61]">
          Add Employee
        </Link>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6 flex space-x-4">
        <input 
          type="text" 
          placeholder="Search by name, ID, phone..." 
          className="border p-2 rounded flex-1"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select 
          className="border p-2 rounded" 
          value={activeFilter} 
          onChange={(e) => { setActiveFilter(e.target.value as "all" | "active" | "inactive"); setPage(1); }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-medium text-gray-500">Employee ID / Biometric ID</th>
              <th className="p-4 font-medium text-gray-500">Name</th>
              <th className="p-4 font-medium text-gray-500">Department</th>
              <th className="p-4 font-medium text-gray-500">Status</th>
              <th className="p-4 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={String(emp.id)} className="border-b hover:bg-gray-50">
                <td className="p-4">{String(emp.employee_code || "—")} / {String(emp.biometric_id)}</td>
                <td className="p-4 font-medium">{String(emp.name)}</td>
                <td className="p-4">{String(emp.department || "-")}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 text-xs rounded-full ${emp.active ? "bg-green-100 text-green-800" : "bg-[#FFE3B3] text-[#7C4A03]"}`}>
                    {emp.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="p-4">
                  <Link href={`/employees/${String(emp.id)}`} className="text-blue-600 hover:underline">
                    View / Edit
                  </Link>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">No employees found.</td>
              </tr>
            )}
          </tbody>
        </table>
        
        <div className="p-4 border-t flex justify-between items-center text-sm text-gray-600">
          <div>Showing {employees.length} of {total} employees</div>
          <div className="space-x-2">
            <button 
              disabled={page <= 1} 
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 border rounded disabled:bg-[#E5E7EB] disabled:text-[#64748B] disabled:opacity-100 disabled:border-transparent"
            >
              Previous
            </button>
            <button 
              disabled={employees.length < 20} 
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 border rounded disabled:bg-[#E5E7EB] disabled:text-[#64748B] disabled:opacity-100 disabled:border-transparent"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
