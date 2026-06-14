import { useEffect } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { SessionProvider, useSession } from "@/features/auth";
import { ThemeProvider } from "./context/ThemeContext";
import { SplashScreen } from "./pages/SplashScreen";
import { SignInPage } from "./pages/SignInPage";
import { PosTerminalPage } from "./pages/PosTerminalPage";
import { usePosViewportScale } from "./viewportScale";

function SplashGate() {
  const navigate = useNavigate();
  const { isSignedIn } = useSession();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(isSignedIn ? "/pos" : "/signin", { replace: true });
    }, 2800);
    return () => clearTimeout(timer);
  }, [navigate, isSignedIn]);

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
  usePosViewportScale();

  return (
    <div className="pos-viewport">
      <div className="pos-app">
        <Routes>
          <Route path="/" element={<SplashGate />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/pos" element={<ProtectedPos />} />
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
