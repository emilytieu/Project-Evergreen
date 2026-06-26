import React from "react";
import ReactDOM from "react-dom/client";

import HydrogenBuilder from "./HydrogenBuilder";
import Predictor from "./Predictor";
import "./builder.css";
import "./predictor.css";


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