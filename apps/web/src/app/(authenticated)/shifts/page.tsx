"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { formatShiftTime } from "@/lib/format";

export default function ShiftsListPage() {
  const [shifts, setShifts] = useState<Record<string, string | number | boolean>[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let url = "/shifts";
    if (activeFilter === "active") url += "?active=true";
    if (activeFilter === "inactive") url += "?active=false";

    apiClient.get(url)
      .then((data) => setShifts(data as Record<string, string | number | boolean>[]))
      .catch((err: unknown) => console.error(err));
  }, [activeFilter]);

  const filteredShifts = shifts.filter(s => 
    String(s.name).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Shifts</h1>
        <Link href="/shifts/new" className="px-4 py-2 bg-[#028174] text-white rounded hover:bg-[#026c61]">
          Add Shift
        </Link>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6 flex space-x-4">
        <input 
          type="text" 
          placeholder="Search by shift name..." 
          className="border p-2 rounded flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select 
          className="border p-2 rounded" 
          value={activeFilter} 
          onChange={(e) => setActiveFilter(e.target.value as "all" | "active" | "inactive")}
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
              <th className="p-4 font-medium text-gray-500">Name</th>
              <th className="p-4 font-medium text-gray-500">Time</th>
              <th className="p-4 font-medium text-gray-500">Grace (mins)</th>
              <th className="p-4 font-medium text-gray-500">Status</th>
              <th className="p-4 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredShifts.map((shift) => (
              <tr key={String(shift.id)} className="border-b hover:bg-gray-50">
                <td className="p-4 font-medium">
                  {shift.name} 
                  {shift.is_overnight && <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">Overnight</span>}
                </td>
                <td className="p-4">{formatShiftTime(shift.start_time)} – {formatShiftTime(shift.end_time)}</td>
                <td className="p-4">{shift.grace_minutes}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 text-xs rounded-full ${shift.active ? "bg-green-100 text-green-800" : "bg-[#FFE3B3] text-[#7C4A03]"}`}>
                    {shift.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="p-4">
                  <Link href={`/shifts/${String(shift.id)}`} className="text-blue-600 hover:underline">
                    View / Edit
                  </Link>
                </td>
              </tr>
            ))}
            {filteredShifts.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">No shifts found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
