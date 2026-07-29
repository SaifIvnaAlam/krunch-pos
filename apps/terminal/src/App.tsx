import { useEffect } from "react";
import { Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom";
import { SessionProvider, useSession } from "@/features/auth";
import { ThemeProvider } from "./context/ThemeContext";
import { SplashScreen } from "./pages/SplashScreen";
import { SignInPage } from "./pages/SignInPage";
import { PosTerminalPage } from "./pages/PosTerminalPage";
import { PhoneCapturePage } from "./pages/PhoneCapturePage";
import { usePosViewportScale } from "./viewportScale";

function SplashGate() {
  const navigate = useNavigate();
  const { isSignedIn } = useSession();

  useEffect(() => {
    if (isSignedIn) return;
    const timer = setTimeout(() => {
      navigate("/signin", { replace: true });
    }, 500);
    return () => clearTimeout(timer);
  }, [navigate, isSignedIn]);

  if (isSignedIn) {
    return <Navigate to="/pos" replace />;
  }

  return <SplashScreen />;
}

function ProtectedPos() {
  const { isSignedIn } = useSession();
  if (!isSignedIn) {
    return <Navigate to="/signin" replace />;
  }
  return <PosTerminalPage />;
}

function AppRoutes() {
  const location = useLocation();
  const isCapture = location.pathname.startsWith("/capture/");
  // Phone capture is a real mobile page — do not apply the 1280×800 POS scale.
  usePosViewportScale(!isCapture);

  useEffect(() => {
    if (!isCapture) return;
    // Global POS shell locks scroll; unlock for the phone capture page.
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    const prev = {
      html: html.style.overflow,
      body: body.style.overflow,
      root: root?.style.overflow ?? "",
    };
    html.style.overflow = "auto";
    body.style.overflow = "auto";
    if (root) root.style.overflow = "auto";
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
      if (root) root.style.overflow = prev.root;
    };
  }, [isCapture]);

  if (isCapture) {
    return (
      <Routes>
        <Route path="/capture/:token" element={<PhoneCapturePage />} />
      </Routes>
    );
  }

  return (
    <div className="pos-viewport">
      <div className="pos-app">
        <Routes>
          <Route path="/" element={<SplashGate />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/pos" element={<ProtectedPos />} />
          <Route path="/capture/:token" element={<PhoneCapturePage />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </ThemeProvider>
  );
}
