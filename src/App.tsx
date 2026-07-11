import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/lib/role";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AdminLayout from "./components/AdminLayout";
import SupervisorLayout from "./components/SupervisorLayout";
import { AuthGuard } from "./components/AuthGuard";
import Auth from "./pages/auth/Auth";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import PendingApproval from "./pages/auth/PendingApproval";
import Quotations from "./pages/admin/Quotations";
import QuotationDetail from "./pages/admin/QuotationDetail";
import PurchaseOrders from "./pages/admin/PurchaseOrders";
import PurchaseOrderDetail from "./pages/admin/PurchaseOrderDetail";
import PurchaseOrderAssign from "./pages/admin/PurchaseOrderAssign";
import PurchaseOrderSites from "./pages/admin/PurchaseOrderSites";
import Workers from "./pages/admin/Workers";
import Dashboard from "./pages/admin/Dashboard";
import Status from "./pages/sup/Status";

import SupAssign from "./pages/sup/Assign";
import Photos from "./pages/sup/Photos";
import Attendance from "./pages/sup/Attendance";
import AdminAttendance from "./pages/admin/Attendance";
import Team from "./pages/sup/Team";
import WorkReport from "./pages/sup/WorkReport";
import Wages from "./pages/sup/Wages";
import Contractors from "./pages/admin/Contractors";
import Supervisors from "./pages/admin/Supervisors";
import Clients from "./pages/admin/masters/Clients";
import ItemCatalog from "./pages/admin/masters/ItemCatalog";
import Uoms from "./pages/admin/masters/Uoms";
import Designations from "./pages/admin/masters/Designations";
import Tasks from "./pages/sup/Tasks";
import Allotment from "./pages/sup/Allotment";
import Report from "./pages/sup/Report";
import DailyWages from "./pages/shared/DailyWages";
import Users from "./pages/admin/Users";
import Employees from "./pages/admin/Employees";
import WageEdits from "./pages/admin/WageEdits";
import WageShareReport from "./pages/admin/WageShareReport";
import WageRecalc from "./pages/admin/WageRecalc";
import Assignments from "./pages/admin/Assignments";
import ClientDemo from "./pages/demo/ClientDemo";
import Reports from "./pages/admin/Reports";
import DemoIndex from "./pages/demo/DemoIndex";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RoleProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pending-approval" element={<PendingApproval />} />

            <Route element={<AuthGuard require="admin"><AdminLayout /></AuthGuard>}>
              <Route path="/admin/dashboard" element={<Dashboard />} />
              <Route path="/admin/quotations" element={<Quotations />} />
              <Route path="/admin/quotations/:id" element={<QuotationDetail />} />
              <Route path="/admin/purchase-orders" element={<PurchaseOrders />} />
              <Route path="/admin/purchase-orders/:id" element={<PurchaseOrderDetail />} />
              <Route path="/admin/purchase-orders/:id/assign" element={<PurchaseOrderAssign />} />
              <Route path="/admin/purchase-orders/:id/sites" element={<PurchaseOrderSites />} />
              <Route path="/admin/assignments" element={<Assignments />} />
              <Route path="/admin/workers" element={<Workers />} />
              <Route path="/admin/employees" element={<Employees />} />
              <Route path="/admin/wage-edits" element={<WageEdits />} />
              <Route path="/admin/wage-share" element={<WageShareReport />} />
              <Route path="/admin/wage-recalc" element={<WageRecalc />} />
              <Route path="/admin/contractors" element={<Contractors />} />
              <Route path="/admin/supervisors" element={<Supervisors />} />
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/masters/clients" element={<Clients />} />
              <Route path="/admin/masters/items" element={<ItemCatalog />} />
              <Route path="/admin/masters/uoms" element={<Uoms />} />
              <Route path="/admin/masters/designations" element={<Designations />} />
              <Route path="/admin/daily-wages" element={<DailyWages />} />
              <Route path="/admin/attendance" element={<AdminAttendance />} />
              <Route path="/admin/reports" element={<Reports />} />
            </Route>

            <Route element={<AuthGuard require="supervisor"><SupervisorLayout /></AuthGuard>}>
              <Route path="/sup/status" element={<Status />} />
              <Route path="/sup/team" element={<Team />} />
              <Route path="/sup/roster" element={<Navigate to="/sup/team" replace />} />
              <Route path="/sup/assign" element={<SupAssign />} />
              <Route path="/sup/photos" element={<Photos />} />
              <Route path="/sup/attendance" element={<Attendance />} />
              <Route path="/sup/work-report" element={<WorkReport />} />
              <Route path="/sup/wages" element={<Wages />} />
              <Route path="/sup/tasks" element={<Tasks />} />
              <Route path="/sup/allotment/:lineItemId" element={<Allotment />} />
              <Route path="/sup/report" element={<Report />} />
              <Route path="/sup/daily-wages" element={<DailyWages />} />
            </Route>


            <Route path="/_demos" element={<DemoIndex />} />
            <Route path="/c/:customerSlug" element={<ClientDemo />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </RoleProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
