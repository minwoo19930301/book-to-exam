import { useNavigate } from "react-router-dom";
import Chrome from "./Chrome.jsx";

const ITEMS = [
  { label: "뷰어", to: "/viewer" },
  { label: "객관식", to: "/quiz" },
  { label: "빈칸 채우기", to: "/blank" },
  { label: "단답형", to: "/short" },
  { label: "서술형", to: "/essay" },
];

export default function Menu() {
  const nav = useNavigate();
  return (
    <Chrome title="">
      <div className="menu-real static">
        <h1>어떻게 공부할까요?</h1>
        {ITEMS.map((item) => (
          <button key={item.to} className="menu-item" type="button" onClick={() => nav(item.to)}>
            <span>{item.label}</span><span className="menu-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
    </Chrome>
  );
}
