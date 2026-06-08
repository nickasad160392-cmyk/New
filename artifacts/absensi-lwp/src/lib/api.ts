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
  id: number; name: string; email: string; role: string;
  jabatan?: string | null; position?: string | null;
  employeeId?: string | null; phone?: string | null;
  isActive: boolean; hasFaceDescriptor?: boolean;
  facePhoto?: string | null;
  profilePhoto?: string | null;
};
export type AttendanceRecord = {
  id: number; userId: number; date: string;
  checkInTime?: string | null; checkOutTime?: string | null;
  status: string; checkInSelfie?: string | null; checkOutSelfie?: string | null;
  checkInLatitude?: number | null; checkInLongitude?: number | null;
  checkInAccuracy?: number | null; workMinutes?: number | null;
  overtimeMinutes?: number | null; latenessMinutes?: number | null;
  overtimeCheckInTime?: string | null; overtimeCheckOutTime?: string | null;
  overtimeCheckInSelfie?: string | null; overtimeExtraMinutes?: number | null;
  createdAt: string;
};
export type LeaveRequest = {
  id: number; userId: number; type: string; startDate: string; endDate: string;
  reason: string; status: string; adminNote?: string | null; createdAt: string;
  user?: { id: number; name: string; jabatan?: string | null; employeeId?: string | null };
};
export type CycleSummary = {
  cycleLabel: string; cycleStart: string; presentDays: number; lateDays: number;
  permitDays: number; absentDays: number; totalWorkMinutes: number;
  totalOvertimeMinutes: number; totalLatenessMinutes: number;
};
export type AdminAttendanceRecord = AttendanceRecord & {
  checkInLatitude?: number | null; checkInLongitude?: number | null;
  user: { id: number; name: string; jabatan?: string | null; employeeId?: string | null; profilePhoto?: string | null };
};
export type DailyTask = {
  id: number; userId: number; date: string; title: string;
  target?: string | null; isCompleted: boolean; notes?: string | null; createdAt: string;
};
export type Goal = {
  id: number; userId: number; period: string; periodType: string;
  title: string; description?: string | null;
  targetValue: number; progressValue: number; status: string; createdAt: string;
};

export const api = {
  auth: {
    login: (identifier: string, password: string) =>
      apiFetch<{ user: UserProfile; token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) }),
    register: (name: string, email: string, password: string, phone?: string) =>
      apiFetch<{ user: UserProfile; token: string }>("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password, phone }) }),
    me: () => apiFetch<UserProfile>("/api/auth/me"),
    logout: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
    registerFacePhoto: (photoBase64: string) =>
      apiFetch<{ ok: boolean; user: UserProfile }>("/api/auth/register-face-photo", { method: "POST", body: JSON.stringify({ photoBase64 }) }),
    deleteFacePhoto: () =>
      apiFetch<{ ok: boolean }>("/api/auth/face-photo", { method: "DELETE" }),
    registerSelfie: (photoBase64: string) =>
      apiFetch<{ ok: boolean }>("/api/auth/register-selfie", { method: "POST", body: JSON.stringify({ photoBase64 }) }),
    uploadPhoto: (photoBase64: string) =>
      apiFetch<UserProfile>("/api/auth/upload-photo", { method: "POST", body: JSON.stringify({ photoBase64 }) }),
    deletePhoto: () =>
      apiFetch<{ ok: boolean }>("/api/auth/photo", { method: "DELETE" }),
    faceDescriptor: () => apiFetch<{ descriptor: number[] | null; facePhoto: string | null; profilePhoto: string | null }>("/api/auth/face-descriptor"),
  },
  attendance: {
    checkIn: (body: { selfieBase64?: string; latitude?: number; longitude?: number; accuracy?: number }) =>
      apiFetch<AttendanceRecord>("/api/attendance/check-in", { method: "POST", body: JSON.stringify(body) }),
    checkOut: (body: { selfieBase64?: string }) =>
      apiFetch<AttendanceRecord>("/api/attendance/check-out", { method: "POST", body: JSON.stringify(body) }),
    overtimeCheckIn: (body: { selfieBase64?: string }) =>
      apiFetch<AttendanceRecord>("/api/attendance/overtime-check-in", { method: "POST", body: JSON.stringify(body) }),
    overtimeCheckOut: () =>
      apiFetch<AttendanceRecord>("/api/attendance/overtime-check-out", { method: "POST", body: JSON.stringify({}) }),
    today: () => apiFetch<AttendanceRecord | null>("/api/attendance/today"),
    history: (monthStart: string) => apiFetch<AttendanceRecord[]>(`/api/attendance/history?cycleStart=${monthStart}`),
    cycleSummary: (monthStart: string) => apiFetch<CycleSummary>(`/api/attendance/cycle-summary?cycleStart=${monthStart}`),
  },
  leave: {
    list: (status?: string) => apiFetch<LeaveRequest[]>(`/api/leave${status ? `?status=${status}` : ""}`),
    create: (body: { type: string; startDate: string; endDate: string; reason: string }) =>
      apiFetch<LeaveRequest>("/api/leave", { method: "POST", body: JSON.stringify(body) }),
  },
  tasks: {
    list: (date?: string) => apiFetch<DailyTask[]>(`/api/tasks${date ? `?date=${date}` : ""}`),
    history: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return apiFetch<DailyTask[]>(`/api/tasks/history${params.toString() ? `?${params}` : ""}`);
    },
    create: (body: { title: string; target?: string; notes?: string; date?: string }) =>
      apiFetch<DailyTask>("/api/tasks", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: { title?: string; target?: string; isCompleted?: boolean; notes?: string }) =>
      apiFetch<DailyTask>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: number) => apiFetch<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
  },
  goals: {
    list: (period?: string, periodType?: string) => {
      const params = new URLSearchParams();
      if (period) params.set("period", period);
      if (periodType) params.set("periodType", periodType);
      return apiFetch<Goal[]>(`/api/goals${params.toString() ? `?${params}` : ""}`);
    },
    create: (body: { title: string; period: string; periodType: string; description?: string; targetValue?: number }) =>
      apiFetch<Goal>("/api/goals", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: { title?: string; description?: string; progressValue?: number; status?: string; targetValue?: number }) =>
      apiFetch<Goal>(`/api/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: number) => apiFetch<{ ok: boolean }>(`/api/goals/${id}`, { method: "DELETE" }),
  },
  admin: {
    attendanceToday: () => apiFetch<{ date: string; records: AdminAttendanceRecord[] }>("/api/admin/attendance/today"),
    attendance: (monthStart: string) => apiFetch<AdminAttendanceRecord[]>(`/api/admin/attendance?cycleStart=${monthStart}`),
    leave: (status?: string) => apiFetch<LeaveRequest[]>(`/api/admin/leave${status ? `?status=${status}` : ""}`),
    approveLeave: (id: number, adminNote?: string) =>
      apiFetch<LeaveRequest>(`/api/admin/leave/${id}/approve`, { method: "POST", body: JSON.stringify({ adminNote }) }),
    rejectLeave: (id: number, adminNote?: string) =>
      apiFetch<LeaveRequest>(`/api/admin/leave/${id}/reject`, { method: "POST", body: JSON.stringify({ adminNote }) }),
    users: () => apiFetch<UserProfile[]>("/api/admin/users"),
    updateUser: (id: number, body: Partial<{ name: string; jabatan: string; role: string; isActive: boolean }>) =>
      apiFetch<UserProfile>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    resetPassword: (id: number, newPassword: string) =>
      apiFetch<{ ok: boolean }>(`/api/admin/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword }) }),
    resetAttendance: () =>
      apiFetch<{ ok: boolean; message: string }>("/api/admin/reset-attendance", { method: "DELETE" }),
    resetAllData: () =>
      apiFetch<{ ok: boolean; message: string }>("/api/admin/reset-all-data", { method: "DELETE" }),
    employeeTasks: (date?: string) =>
      apiFetch<Array<DailyTask & { userName: string; userJabatan?: string | null }>>(`/api/admin/employee-tasks${date ? `?date=${date}` : ""}`),
  },
};
