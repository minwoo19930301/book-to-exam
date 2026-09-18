import { Link } from "react-router-dom";

export default function Chrome({ title, children }) {
  return (
    <div className="page">
      <div className="bar">
        <Link to="/">시험지</Link>
        <span className="kicker">{title}</span>
      </div>
      {children}
    </div>
  );
}
