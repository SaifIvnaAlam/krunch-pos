import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useSession } from "@/features/auth";
import { getSeededAdminEmail } from "@/shared/config/env";
import { fetchHealth } from "@/features/health";
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
  const { signInWithCredentials } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const checkApi = () => {
      fetchHealth()
        .then(() => {
          if (cancelled) return;
          setIsOnline(true);
          if (intervalId) clearInterval(intervalId);
        })
        .catch(() => {
          if (!cancelled) setIsOnline(false);
        });
    };

    checkApi();
    intervalId = setInterval(checkApi, 3000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null);
    const normalized = email.trim().toLowerCase();
    if (normalized !== getSeededAdminEmail().toLowerCase()) {
      setSignInError(
        `Only ${getSeededAdminEmail()} can sign in on this terminal.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      await signInWithCredentials(email, password);
      navigate("/pos", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setSignInError(message);
    } finally {
      setSubmitting(false);
    }
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

            {signInError ? (
              <p
                className="mb-4 rounded-[9px] border border-solid border-[#f0c2c2] bg-[#fff5f5] px-3 py-2 text-[12px] text-[#b42318]"
                role="alert"
              >
                {signInError}
              </p>
            ) : null}

            <p className="mb-4 text-[11px] leading-relaxed text-[var(--pos-text-2)]">
              Sign in with the seeded owner{" "}
              <span className="font-mono text-[var(--pos-text-1)]">
                {getSeededAdminEmail()}
              </span>{" "}
              and password{" "}
              <span className="font-mono text-[var(--pos-text-1)]">Owner123!</span>{" "}
              (run <span className="font-mono">npm run db:seed</span> once).
            </p>

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
                disabled={submitting}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--pos-primary-bg)] px-5 text-[13px] font-medium text-[var(--pos-primary-fg)] transition-[opacity,background-color] duration-150 hover:bg-[var(--pos-primary-hover)] disabled:opacity-60"
              >
                {submitting ? "Signing in…" : "Sign in"}
                <ArrowRight className="size-4 shrink-0" strokeWidth={2} />
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-[11px] text-[var(--pos-icon-muted)]">
            By signing in, you agree to the terms of service.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
