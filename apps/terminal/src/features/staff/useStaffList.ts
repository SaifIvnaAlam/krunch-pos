import { useCallback, useEffect, useState } from "react";
import { fetchStaffFromApi, type ApiStaffMember } from "./staffApi";

export type StaffDirectoryRow = {
  id: string;
  name: string;
  role: string;
  dept: string;
  phone: string;
  status: "active" | "leave";
  hired: string;
};

function mapStaff(row: ApiStaffMember): StaffDirectoryRow {
  const roleName = row.roles[0]?.roleName ?? "Staff";
  return {
    id: row.id,
    name: row.name,
    role: roleName.replace(/_/g, " "),
    dept: "—",
    phone: row.email ?? "—",
    status: row.isActive ? "active" : "leave",
    hired: "—",
  };
}

export function useStaffList() {
  const [staff, setStaff] = useState<StaffDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchStaffFromApi();
      setStaff(rows.map(mapStaff));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { staff, loading, error, refresh };
}
