import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
import { EmbedNotificationsPage } from "./pages/EmbedNotificationsPage";
import { mergeSearchWithPersistedEmbed, readPersistedEmbedQuery } from "./lib/trainifyEmbedUrl";

function PrivateRoute() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RootToCatalogRedirect() {
  const loc = useLocation();
  return <Navigate to={{ pathname: "/catalog", search: loc.search }} replace />;
}

function EmbedSearchPersister() {
  const loc = useLocation();
  const nav = useNavigate();
  const persisted = readPersistedEmbedQuery();
  const hasPersisted = Boolean(persisted && (persisted.get("embed") || persisted.get("trainifyEmbed")));

  // Ako smo u embed flow-u, ali trenutna ruta nema embed parametre, vrati ih (replace) bez promene path-a.
  // Ovo popravlja interne Link/Navigate koji ne prenose location.search (npr. iz korpe na prodavnicu).
  useEffect(() => {
    if (!hasPersisted) return;
    const merged = mergeSearchWithPersistedEmbed(loc.search || "");
    if (merged && merged !== (loc.search || "")) {
      nav({ pathname: loc.pathname, search: merged }, { replace: true });
    }
  }, [hasPersisted, loc.pathname, loc.search, nav]);
  return null;
}

export function App() {
  return (
    <div className="app-root-fill">
      <EmbedSearchPersister />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/callback" element={<OidcCallback />} />
        <Route element={<PrivateRoute />}>
          <Route path="/admin/select-tenant" element={<AdminSelectTenantPage />} />
          <Route element={<Layout />}>
          <Route path="/" element={<RootToCatalogRedirect />} />
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
          <Route path="/embed/notifications" element={<EmbedNotificationsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/catalog" replace />} />
      </Routes>
    </div>
  );
}
