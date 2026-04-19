import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { AdminSelectTenantPage } from "./pages/AdminSelectTenantPage";
import { CartPage } from "./pages/CartPage";
import { CatalogPage } from "./pages/CatalogPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { OidcCallback } from "./auth/OidcCallback";
import { LoginPage } from "./pages/LoginPage";
import { ManagerPage } from "./pages/ManagerPage";
import { ReportsPage } from "./pages/ReportsPage";
import { StaffAiChatPage } from "./pages/StaffAiChatPage";
import { MeasureUnitsPage } from "./pages/MeasureUnitsPage";
import { OrderPage } from "./pages/OrderPage";
import { ProductTypesPage } from "./pages/ProductTypesPage";
import { ProductsPage } from "./pages/ProductsPage";
import { CustomerOrdersPage, ReceptionPage } from "./pages/ReceptionPage";
import { StaffDirectoryPage } from "./pages/StaffDirectoryPage";
import { LicenseAdminPage } from "./pages/LicenseAdminPage";
import { TenantSettingsPage } from "./pages/TenantSettingsPage";

function PrivateRoute() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <div className="app-root-fill">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/callback" element={<OidcCallback />} />
        <Route element={<PrivateRoute />}>
          <Route path="/admin/select-tenant" element={<AdminSelectTenantPage />} />
          <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/catalog" replace />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders/:id" element={<OrderPage />} />
          <Route path="/reception" element={<ReceptionPage />} />
          <Route path="/orders" element={<CustomerOrdersPage />} />
          <Route path="/manager" element={<ManagerPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/ai" element={<StaffAiChatPage />} />
          <Route path="/tenant-settings" element={<TenantSettingsPage />} />
          <Route path="/reference/staff" element={<StaffDirectoryPage />} />
          <Route path="/reference/products" element={<ProductsPage />} />
          <Route path="/reference/product-types" element={<ProductTypesPage />} />
          <Route path="/reference/measure-units" element={<MeasureUnitsPage />} />
          <Route path="/admin/licenses" element={<LicenseAdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/catalog" replace />} />
      </Routes>
    </div>
  );
}
