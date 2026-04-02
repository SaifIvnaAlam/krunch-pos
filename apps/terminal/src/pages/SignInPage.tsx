import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useDevAuth } from "../context/DevAuthContext";
import {
  UtensilsCrossed,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  WifiOff,
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";

const borderRest =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";
const borderHover = "hover:[border-color:var(--pos-border-strong)]";
const borderFocus =
  "focus:[border-color:var(--pos-text-1)] focus:outline-none focus-visible:outline-none";

export function SignInPage() {
  const navigate = useNavigate();
  const { signIn, isSignedIn } = useDevAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isOnline] = useState(true);

  useEffect(() => {
    if (isSignedIn) {
      navigate("/pos", { replace: true });
    }
  }, [isSignedIn, navigate]);

  const handleGoogleSignIn = () => {
    signIn();
    navigate("/pos", { replace: true });
  };

  const handleEmailSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    signIn();
    navigate("/pos", { replace: true });
  };

  return (
    <div className="relative flex h-full w-full bg-[var(--pos-page)] text-[var(--pos-text-3)]">
      <div className="absolute right-4 top-4 z-20 lg:right-6 lg:top-6">
        <ThemeToggle />
      </div>
      {/* Left — branding */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className={`relative z-10 m-6 hidden w-[420px] shrink-0 flex-col justify-between rounded-[14px] bg-[var(--pos-sidebar)] p-10 lg:flex ${borderRest}`}
      >
        <div>
          <div className="mb-16 flex items-center gap-3">
            <div
              className={`flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[#1a1a18] ${borderRest}`}
            >
              <UtensilsCrossed className="size-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[22px] font-medium leading-none tracking-[-0.02em] text-[var(--pos-text-1)]">
                Steak & Marrow
              </p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
                Point of sale · Terminal
              </p>
            </div>
          </div>

          <h1 className="mb-4 text-[22px] font-medium leading-snug tracking-[-0.02em] text-[var(--pos-text-1)]">
            Sell and serve from one screen.
          </h1>
          <p className="max-w-[300px] text-[13px] font-normal leading-relaxed text-[var(--pos-text-2)]">
            Take orders, send them to the kitchen, and keep working when the
            connection drops.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--pos-text-2)]">
          {isOnline ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#c8efd8] px-[10px] py-[3px] text-[11px] font-medium text-[#2e9b65]">
                <span className="size-[5px] shrink-0 rounded-full bg-[#2e9b65]" />
                <span className="font-medium">Connected</span>
              </span>
            </>
          ) : (
            <>
              <WifiOff className="size-3.5 text-[#e8472a]" strokeWidth={2} />
              <span className="text-[#e8472a]">Offline</span>
            </>
          )}
          <span className="text-[var(--pos-icon-muted)]" aria-hidden>
            ·
          </span>
          <span className="font-mono text-[11px] font-normal tracking-tight text-[var(--pos-text-2)]">
            v0.1.0
          </span>
        </div>
      </motion.div>

      {/* Right — sign in */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="relative z-10 flex flex-1 items-center justify-center px-6 py-8"
      >
        <div className="w-full max-w-[400px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[#1a1a18] ${borderRest}`}
            >
              <UtensilsCrossed className="size-5 text-white" strokeWidth={2} />
            </div>
            <p className="text-[18px] font-medium tracking-[-0.01em] text-[var(--pos-text-1)]">
              Steak & Marrow
            </p>
          </div>

          <div
            className={`rounded-[14px] bg-[var(--pos-card)] p-8 ${borderRest} ${borderHover} transition-[border-color] duration-150`}
          >
            <p className="text-[18px] font-medium tracking-[-0.01em] text-[var(--pos-text-1)]">
              Welcome back
            </p>
            <p className="mb-8 mt-1 text-[13px] text-[var(--pos-text-2)]">
              Sign in to access your terminal
            </p>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="flex h-10 w-full items-center justify-center gap-3 rounded-[10px] border-[1.5px] border-solid bg-transparent px-5 text-[13px] font-medium text-[var(--pos-text-1)] transition-[border-color,background-color] duration-150 [border-color:var(--pos-input-border)] hover:[border-color:var(--pos-border-strong)]"
            >
              <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>

            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-[var(--pos-divider)]" />
              <span className="text-[11px] text-[var(--pos-icon-muted)]">or</span>
              <div className="h-px flex-1 bg-[var(--pos-divider)]" />
            </div>

            <form onSubmit={handleEmailSignIn} className="flex flex-col gap-4">
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-icon-muted)]"
                  strokeWidth={2}
                />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`h-9 w-full rounded-[9px] border border-solid py-[9px] pl-10 pr-3 text-[13px] [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] ${borderFocus} transition-[border-color] duration-150`}
                />
              </div>

              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-icon-muted)]"
                  strokeWidth={2}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`h-9 w-full rounded-[9px] border border-solid py-[9px] pl-10 pr-10 text-[13px] [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] ${borderFocus} transition-[border-color] duration-150`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--pos-icon-muted)] transition-colors duration-150 hover:text-[var(--pos-text-2)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" strokeWidth={2} />
                  ) : (
                    <Eye className="size-4" strokeWidth={2} />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 rounded border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] accent-[var(--pos-primary-bg)] focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-[11px] text-[var(--pos-text-2)]">Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-[11px] text-[var(--pos-text-2)] transition-colors duration-150 hover:text-[var(--pos-text-1)]"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--pos-primary-bg)] px-5 text-[13px] font-medium text-[var(--pos-primary-fg)] transition-[opacity,background-color] duration-150 hover:bg-[var(--pos-primary-hover)]"
              >
                Sign in
                <ArrowRight className="size-4 shrink-0" strokeWidth={2} />
              </button>
            </form>

            <div className="mt-6 border-t border-solid [border-color:var(--pos-divider)] pt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  signIn();
                  navigate("/pos", { replace: true });
                }}
                className="text-[13px] text-[var(--pos-text-2)] transition-colors duration-150 hover:text-[var(--pos-text-1)]"
              >
                Sign in with staff PIN instead
              </button>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-[var(--pos-icon-muted)]">
            By signing in, you agree to the terms of service.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
