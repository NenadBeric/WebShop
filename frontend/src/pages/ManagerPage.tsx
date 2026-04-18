import { Navigate } from "react-router-dom";

/** @deprecated Koristi /reference/products — zadržano radi starih linkova. */
export function ManagerPage() {
  return <Navigate to="/reference/products" replace />;
}
