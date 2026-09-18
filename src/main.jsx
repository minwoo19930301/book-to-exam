import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./styles.css";
import { SettingsProvider } from "./settings.jsx";
import Home from "./Home.jsx";
import Exam from "./Exam.jsx";
import Viewer from "./Viewer.jsx";
import Quiz from "./Quiz.jsx";
import Essay from "./Essay.jsx";
import ApiKey from "./ApiKey.jsx";

createRoot(document.getElementById("root")).render(
  <SettingsProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/exam" element={<Exam />} />
        <Route path="/viewer" element={<Viewer />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/essay" element={<Essay />} />
        <Route path="/apikey" element={<ApiKey />} />
      </Routes>
    </BrowserRouter>
  </SettingsProvider>
);
