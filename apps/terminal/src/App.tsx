import { useEffect } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { SessionProvider, useSession } from "@/features/auth";
import { ThemeProvider } from "./context/ThemeContext";
import { SplashScreen } from "./pages/SplashScreen";
import { SignInPage } from "./pages/SignInPage";
import { PosTerminalPage } from "./pages/PosTerminalPage";

function SplashGate() {
  const navigate = useNavigate();
  const { signOut } = useSession();

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        await signOut();
        navigate("/signin", { replace: true });
      })();
    }, 2800);
    return () => clearTimeout(timer);
  }, [navigate, signOut]);

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
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </ThemeProvider>
  );
}
