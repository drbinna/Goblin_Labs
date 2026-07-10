import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./app/App.tsx";
import { Toaster } from "./app/components/ui/sonner";
import "./styles/index.css";

// Publishable key is public by design (it ships in the bundle either way).
// Env var wins so prod can rotate it without a code change.
const CLERK_PK =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  "pk_live_Y2xlcmsudXNlZ29ibGluLnh5eiQ";

// Heavy routes load only when visited.
const Studio = lazy(() => import("./app/routes/Studio.tsx"));
const Talk = lazy(() => import("./app/routes/Talk.tsx"));
const Login = lazy(() => import("./app/routes/Login.tsx"));
const Personas = lazy(() => import("./app/routes/Personas.tsx"));
const Docs = lazy(() => import("./app/routes/Docs.tsx"));
const SupportDemo = lazy(() => import("./app/routes/SupportDemo.tsx"));
const LeadGenDemo = lazy(() => import("./app/routes/LeadGenDemo.tsx"));

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
          path="/demo/leadgen"
          element={
            <Suspense fallback={null}>
              <LeadGenDemo />
            </Suspense>
          }
        />
        <Route
          path="/demo/support"
          element={
            <Suspense fallback={null}>
              <SupportDemo />
            </Suspense>
          }
        />
        <Route
          path="/docs"
          element={
            <Suspense fallback={null}>
              <Docs />
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
    <Toaster />
  </ClerkProvider>,
);
