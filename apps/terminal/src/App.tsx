import { useEffect } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { DevAuthProvider, useDevAuth } from "./context/DevAuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SplashScreen } from "./pages/SplashScreen";
import { SignInPage } from "./pages/SignInPage";
import { PosTerminalPage } from "./pages/PosTerminalPage";

function SplashGate() {
  const navigate = useNavigate();
  const { isSignedIn } = useDevAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(isSignedIn ? "/pos" : "/signin", { replace: true });
    }, 2800);
    return () => clearTimeout(timer);
  }, [navigate, isSignedIn]);

  return <SplashScreen />;
}

function ProtectedPos() {
  const { isSignedIn } = useDevAuth();
  if (!isSignedIn) {
    return <Navigate to="/signin" replace />;
  }
  return <PosTerminalPage />;
}

function AppRoutes() {
  return (
    <div className="pos-app h-full w-full">
      <Routes>
        <Route path="/" element={<SplashGate />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/pos" element={<ProtectedPos />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <DevAuthProvider>
        <AppRoutes />
      </DevAuthProvider>
    </ThemeProvider>
  );
}
