import React from "react";
import ReactDOM from "react-dom/client";

import HydrogenBuilder from "./components/HydrogenBuilder.jsx";
import Predictor from "./components/Predictor.jsx";
import "./components/builder.css";
import "./components/predictor.css";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HydrogenBuilder />} />
        <Route path="/predictor" element={<Predictor />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);