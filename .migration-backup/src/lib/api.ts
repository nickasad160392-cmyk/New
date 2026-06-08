const getToken = () =>
  sessionStorage.getItem("absensi_token") || localStorage.getItem("absensi_token");

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { credentials: "include", ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || res.statusText), { data: body, status: res.status });
  }
  const text = await res.text();
  return text ? JSON.parse(text) : (null as T);
}

export type UserProfile = {
  id: number;
  name: string;
  email: string;
  role: string;
  jabatan?: string | null;
  position?: string | null;
  employeeId?: string | null;
  phone?: string | null;
  isActive: boolean;
};

export type AttendanceRecord = {
  id: number;
  userId: number;
  date: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status: string;
  checkInSelfie?: string | null;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkInAccuracy?: number | null;
  workMinutes?: number | null;
  overtimeMinutes?: number | null;
  latenessMinutes?: number | null;
  createdAt: string;
};

export type LeaveRequest = {
  id: number;
  userId: number;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  adminNote?: string | null;
  createdAt: string;
  user?: { id: number; name: string; jabatan?: string | null; employeeId?: string | null };
};

export type CycleSummary = {
  cycleLabel: string;
  cycleStart: string;
  presentDays: number;
  lateDays: number;
  permitDays: number;
  absentDays: number;
  totalWorkMinutes: number;
  totalOvertimeMinutes: number;
  totalLatenessMinutes: number;
};

export type AdminAttendanceRecord = AttendanceRecord & {
  user: { id: number; name: string; jabatan?: string | null; employeeId?: string | null };
};

export const api = {
  auth: {
    login: (identifier: string, password: string) =>
      apiFetch<{ user: UserProfile; token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      }),
    register: (name: string, email: string, password: string, phone?: string) =>
      apiFetch<{ user: UserProfile; token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, phone }),
      }),
    me: () => apiFetch<UserProfile>("/api/auth/me"),
    logout: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  },
  attendance: {
    checkIn: (body: { selfieBase64?: string; latitude?: number; longitude?: number; accuracy?: number }) =>
      apiFetch<AttendanceRecord>("/api/attendance/check-in", { method: "POST", body: JSON.stringify(body) }),
    checkOut: () =>
      apiFetch<AttendanceRecord>("/api/attendance/check-out", { method: "POST", body: JSON.stringify({}) }),
    today: () => apiFetch<AttendanceRecord | null>("/api/attendance/today"),
    history: (cycleStart: string) =>
      apiFetch<AttendanceRecord[]>(`/api/attendance/history?cycleStart=${cycleStart}`),
    cycleSummary: (cycleStart: string) =>
      apiFetch<CycleSummary>(`/api/attendance/cycle-summary?cycleStart=${cycleStart}`),
  },
  leave: {
    list: (status?: string) =>
      apiFetch<LeaveRequest[]>(`/api/leave${status ? `?status=${status}` : ""}`),
    create: (body: { type: string; startDate: string; endDate: string; reason: string }) =>
      apiFetch<LeaveRequest>("/api/leave", { method: "POST", body: JSON.stringify(body) }),
  },
  admin: {
    attendanceToday: () =>
      apiFetch<{ date: string; records: AdminAttendanceRecord[] }>("/api/admin/attendance/today"),
    attendance: (cycleStart: string) =>
      apiFetch<AdminAttendanceRecord[]>(`/api/admin/attendance?cycleStart=${cycleStart}`),
    leave: (status?: string) =>
      apiFetch<LeaveRequest[]>(`/api/admin/leave${status ? `?status=${status}` : ""}`),
    approveLeave: (id: number, adminNote?: string) =>
      apiFetch<LeaveRequest>(`/api/admin/leave/${id}/approve`, { method: "POST", body: JSON.stringify({ adminNote }) }),
    rejectLeave: (id: number, adminNote?: string) =>
      apiFetch<LeaveRequest>(`/api/admin/leave/${id}/reject`, { method: "POST", body: JSON.stringify({ adminNote }) }),
    users: () => apiFetch<UserProfile[]>("/api/admin/users"),
    updateUser: (id: number, body: Partial<{ jabatan: string; role: string; isActive: boolean }>) =>
      apiFetch<UserProfile>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    resetPassword: (id: number, newPassword: string) =>
      apiFetch<{ ok: boolean }>(`/api/admin/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword }) }),
  },
};
