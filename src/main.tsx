import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import App from "./app/App.tsx";
import "./styles/index.css";

// Studio is a heavy route (avatar studio); load it only when visited.
const Studio = lazy(() => import("./app/routes/Studio.tsx"));
// Public persona talk page — also lazy, since it pulls in the Anam SDK.
const Talk = lazy(() => import("./app/routes/Talk.tsx"));

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route
        path="/studio"
        element={
          <Suspense fallback={null}>
            <Studio />
          </Suspense>
        }
      />
      <Route
        path="/p/:id"
        element={
          <Suspense fallback={null}>
            <Talk />
          </Suspense>
        }
      />
    </Routes>
  </BrowserRouter>,
);
