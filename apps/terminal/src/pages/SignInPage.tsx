import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useSession } from "@/features/auth";
import { lookupRestaurantsForEmail } from "@/features/auth/authApi";
import type { ActiveBranch } from "@/features/auth/types";
import { fetchHealth } from "@/features/health";
import {
  UtensilsCrossed,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  WifiOff,
  ChevronLeft,
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";

const borderRest =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";
const borderHover = "hover:[border-color:var(--pos-border-strong)]";
const borderFocus =
  "focus:[border-color:var(--pos-text-1)] focus:outline-none focus-visible:outline-none";

type SignInStep = "email" | "credentials";

export function SignInPage() {
  const navigate = useNavigate();
  const { signInWithCredentials } = useSession();
  const [step, setStep] = useState<SignInStep>("email");
  const [email, setEmail] = useState("");
  const [restaurants, setRestaurants] = useState<ActiveBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
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

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null);
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setSignInError("Enter your email address.");
      return;
    }

    setSubmitting(true);
    try {
      const found = await lookupRestaurantsForEmail(normalized);
      if (found.length === 0) {
        setSignInError("No restaurant account found for this email.");
        return;
      }
      setRestaurants(found);
      setSelectedBranchId(found.length === 1 ? found[0]!.id : "");
      setPassword("");
      setStep("credentials");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not look up account";
      setSignInError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null);

    if (!selectedBranchId) {
      setSignInError("Choose a restaurant to continue.");
      return;
    }
    if (!password.trim()) {
      setSignInError("Enter your password.");
      return;
    }

    setSubmitting(true);
    try {
      await signInWithCredentials(email.trim(), password, selectedBranchId);
      navigate("/pos", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setSignInError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToEmail = () => {
    setStep("email");
    setSignInError(null);
    setPassword("");
    setRestaurants([]);
    setSelectedBranchId("");
  };

  const selectedRestaurant = restaurants.find((r) => r.id === selectedBranchId);

  return (
    <div className="relative flex h-full w-full bg-[var(--pos-page)] text-[var(--pos-text-3)]">
      <div className="absolute right-4 top-4 z-20 lg:right-6 lg:top-6">
        <ThemeToggle />
      </div>
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
            <span className="inline-flex items-center gap-2 rounded-full bg-[#c8efd8] px-[10px] py-[3px] text-[11px] font-medium text-[#2e9b65]">
              <span className="size-[5px] shrink-0 rounded-full bg-[#2e9b65]" />
              <span className="font-medium">Connected</span>
            </span>
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
              {step === "email"
                ? "Enter your email to find your restaurant"
                : "Sign in to your restaurant"}
            </p>

            {signInError ? (
              <p
                className="mb-4 rounded-[9px] border border-solid border-[#f0c2c2] bg-[#fff5f5] px-3 py-2 text-[12px] text-[#b42318]"
                role="alert"
              >
                {signInError}
              </p>
            ) : null}

            {step === "email" ? (
              <form onSubmit={handleEmailContinue} className="flex flex-col gap-4">
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
                    autoComplete="email"
                    className={`h-9 w-full rounded-[9px] border border-solid py-[9px] pl-10 pr-3 text-[13px] [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] ${borderFocus} transition-[border-color] duration-150`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--pos-primary-bg)] px-5 text-[13px] font-medium text-[var(--pos-primary-fg)] transition-[opacity,background-color] duration-150 hover:bg-[var(--pos-primary-hover)] disabled:opacity-60"
                >
                  {submitting ? "Checking…" : "Continue"}
                  <ArrowRight className="size-4 shrink-0" strokeWidth={2} />
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="inline-flex items-center gap-1 self-start text-[12px] text-[var(--pos-text-2)] transition-colors hover:text-[var(--pos-text-1)]"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                  Change email
                </button>

                <div className="rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                    Email
                  </p>
                  <p className="mt-1 text-[13px] text-[var(--pos-text-1)]">{email.trim()}</p>
                </div>

                {restaurants.length > 1 ? (
                  <div>
                    <label
                      htmlFor="restaurant-select"
                      className="mb-1.5 block text-[11px] font-medium text-[var(--pos-text-2)]"
                    >
                      Restaurant
                    </label>
                    <select
                      id="restaurant-select"
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className={`h-9 w-full rounded-[9px] border border-solid px-3 text-[13px] [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] text-[var(--pos-text-1)] ${borderFocus}`}
                    >
                      <option value="">Select a restaurant</option>
                      {restaurants.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : selectedRestaurant ? (
                  <div className="rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Restaurant
                    </p>
                    <p className="mt-1 text-[13px] text-[var(--pos-text-1)]">
                      {selectedRestaurant.name}
                    </p>
                  </div>
                ) : null}

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
                    autoComplete="current-password"
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

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--pos-primary-bg)] px-5 text-[13px] font-medium text-[var(--pos-primary-fg)] transition-[opacity,background-color] duration-150 hover:bg-[var(--pos-primary-hover)] disabled:opacity-60"
                >
                  {submitting ? "Signing in…" : "Sign in"}
                  <ArrowRight className="size-4 shrink-0" strokeWidth={2} />
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-[11px] text-[var(--pos-icon-muted)]">
            By signing in, you agree to the terms of service.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
