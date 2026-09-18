import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./styles.css";
import Home from "./Home.jsx";
import Viewer from "./Viewer.jsx";
import Quiz from "./Quiz.jsx";
import Essay from "./Essay.jsx";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/viewer" element={<Viewer />} />
      <Route path="/quiz" element={<Quiz />} />
      <Route path="/essay" element={<Essay />} />
    </Routes>
  </BrowserRouter>
);
