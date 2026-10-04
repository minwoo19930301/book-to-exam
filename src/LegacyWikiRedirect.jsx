import { Navigate, useSearchParams } from "react-router-dom";
import { useSubject } from "./subjects.jsx";

export default function LegacyWikiRedirect() {
  const { to } = useSubject();
  const [search] = useSearchParams();
  const page = search.get("page");
  return <Navigate to={to(page ? `/viewer?page=${encodeURIComponent(page)}` : "/viewer")} replace />;
}
