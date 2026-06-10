import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./app/App.tsx";
import "./styles/index.css";

// Publishable key is public by design (it ships in the bundle either way).
// Env var wins so prod can rotate it without a code change.
const CLERK_PK =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  "pk_test_c2tpbGxlZC1mZWxpbmUtNDMuY2xlcmsuYWNjb3VudHMuZGV2JA";

// Heavy routes load only when visited.
const Studio = lazy(() => import("./app/routes/Studio.tsx"));
const Talk = lazy(() => import("./app/routes/Talk.tsx"));
const Login = lazy(() => import("./app/routes/Login.tsx"));
const Personas = lazy(() => import("./app/routes/Personas.tsx"));

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={CLERK_PK} afterSignOutUrl="/">
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
        <Route
          path="/login/*"
          element={
            <Suspense fallback={null}>
              <Login />
            </Suspense>
          }
        />
        <Route
          path="/personas"
          element={
            <Suspense fallback={null}>
              <Personas />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  </ClerkProvider>,
);
