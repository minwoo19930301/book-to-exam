import { Navigate } from "react-router-dom";
import { useSubject } from "./subjects.jsx";

export default function Exam() {
  const { to } = useSubject();
  return <Navigate to={to("/menu")} replace />;
}
