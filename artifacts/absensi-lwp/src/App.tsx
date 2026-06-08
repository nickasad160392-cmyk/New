import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch, useLocation, Redirect } from "wouter";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Home, Clock, FileText, History, Briefcase } from "lucide-react";

import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import AbsenPage from "@/pages/AbsenPage";
import IzinPage from "@/pages/IzinPage";
import RiwayatPage from "@/pages/RiwayatPage";
import AdminPage from "@/pages/AdminPage";
import AdminKaryawanPage from "@/pages/AdminKaryawanPage";
import AdminIzinPage from "@/pages/AdminIzinPage";
import AdminRekapPage from "@/pages/AdminRekapPage";
import AdminMapPage from "@/pages/AdminMapPage";
import FaceRegisterPage from "@/pages/FaceRegisterPage";
import WorkPage from "@/pages/WorkPage";
import EmployeeDirectoryPage from "@/pages/EmployeeDirectoryPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const NAV_ITEMS = [
  { href: "/dashboard", icon: Home,      label: "Beranda" },
  { href: "/absen",     icon: Clock,     label: "Absen"   },
  { href: "/izin",      icon: FileText,  label: "Izin"    },
  { href: "/riwayat",   icon: History,   label: "Riwayat" },
  { href: "/kerja",     icon: Briefcase, label: "Kerja"   },
];

function BottomNav() {
  const [location, navigate] = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100">
      <div className="flex items-stretch max-w-[430px] mx-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                isActive ? "text-[#4A4435]" : "text-[#8C8573]"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "stroke-[#4A4435]" : ""}`} />
              <span className={`text-[9px] font-semibold ${isActive ? "text-[#4A4435]" : ""}`}>{item.label}</span>
              {isActive && <div className="w-1 h-1 rounded-full bg-[#FACC15]" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBF9F3]">
      <div className="w-10 h-10 rounded-full border-4 border-[#FACC15] border-t-transparent animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (user) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FBF9F3] max-w-[430px] mx-auto relative">
      <div className="pb-16">{children}</div>
      <BottomNav />
    </div>
  );
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  return <Redirect to={user ? "/dashboard" : "/login"} />;
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FBF9F3] text-center px-6">
      <p className="text-6xl font-extrabold text-[#FACC15] mb-4">404</p>
      <p className="text-lg font-bold text-[#4A4435] mb-2">Halaman tidak ditemukan</p>
      <a href="/dashboard" className="mt-4 px-6 py-2 rounded-xl bg-[#FACC15] text-[#4A4435] font-bold text-sm">
        Kembali ke Beranda
      </a>
    </div>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login"><PublicRoute><LoginPage /></PublicRoute></Route>
      <Route path="/register"><PublicRoute><RegisterPage /></PublicRoute></Route>

      <Route path="/dashboard">
        <ProtectedRoute><MainLayout><DashboardPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/absen">
        <ProtectedRoute><MainLayout><AbsenPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/izin">
        <ProtectedRoute><MainLayout><IzinPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/riwayat">
        <ProtectedRoute><MainLayout><RiwayatPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/kerja">
        <ProtectedRoute><MainLayout><WorkPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/face-register">
        <ProtectedRoute><FaceRegisterPage /></ProtectedRoute>
      </Route>

      <Route path="/history"><Redirect to="/riwayat" /></Route>
      <Route path="/leave"><Redirect to="/izin" /></Route>

      <Route path="/admin/karyawan">
        <ProtectedRoute><MainLayout><AdminKaryawanPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/admin/direktori">
        <ProtectedRoute><MainLayout><EmployeeDirectoryPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/admin/izin">
        <ProtectedRoute><MainLayout><AdminIzinPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/admin/rekap">
        <ProtectedRoute><MainLayout><AdminRekapPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/admin/map">
        <ProtectedRoute><MainLayout><AdminMapPage /></MainLayout></ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute><MainLayout><AdminPage /></MainLayout></ProtectedRoute>
      </Route>

      <Route path="/"><RootRedirect /></Route>
      <Route><NotFoundPage /></Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRoutes />
        </Router>
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
