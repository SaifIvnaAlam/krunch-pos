import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useSession } from "@/features/auth";
import { lookupRestaurantsForEmail } from "@/features/auth/authApi";
import {
  readRememberedBranchId,
  readRememberedEmail,
  writeRememberedLogin,
} from "@/features/auth/tokenStorage";
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
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { SearchableSelect } from "../components/pos/SearchableSelect";

const borderRest =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";
const borderHover = "hover:[border-color:var(--pos-border-strong)]";
const borderFocus =
  "focus:[border-color:var(--pos-text-1)] focus:outline-none focus-visible:outline-none";

function pickBranchId(
  restaurants: ActiveBranch[],
  preferredId: string,
): string {
  if (restaurants.length === 1) return restaurants[0]!.id;
  if (preferredId && restaurants.some((r) => r.id === preferredId)) {
    return preferredId;
  }
  return "";
}

export function SignInPage() {
  const navigate = useNavigate();
  const { signInWithCredentials } = useSession();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(() => readRememberedEmail());
  const [restaurants, setRestaurants] = useState<ActiveBranch[]>([]);
  const [lookupEmail, setLookupEmail] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState(() =>
    readRememberedBranchId(),
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (readRememberedEmail()) {
      passwordRef.current?.focus();
    } else {
      emailRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const remembered = readRememberedEmail();
    if (!remembered) return;

    let cancelled = false;
    void lookupRestaurantsForEmail(remembered)
      .then((found) => {
        if (cancelled) return;
        setRestaurants(found);
        setLookupEmail(remembered);
        setSelectedBranchId(pickBranchId(found, readRememberedBranchId()));
      })
      .catch(() => {
        /* lookup on submit if prefetch fails */
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleEmailChange = (value: string) => {
    setEmail(value);
    const normalized = value.trim().toLowerCase();
    if (normalized !== lookupEmail) {
      setRestaurants([]);
      setLookupEmail("");
      setSelectedBranchId("");
    }
  };

  const resolveRestaurants = async (normalizedEmail: string) => {
    if (lookupEmail === normalizedEmail && restaurants.length > 0) {
      return restaurants;
    }
    const found = await lookupRestaurantsForEmail(normalizedEmail);
    setRestaurants(found);
    setLookupEmail(normalizedEmail);
    return found;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null);

    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setSignInError("Enter your email address.");
      emailRef.current?.focus();
      return;
    }
    if (!password.trim()) {
      setSignInError("Enter your password.");
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const found = await resolveRestaurants(normalized);
      if (found.length === 0) {
        setSignInError("No restaurant account found for this email.");
        return;
      }

      const branchId = pickBranchId(found, selectedBranchId);
      if (!branchId) {
        setSelectedBranchId("");
        setSignInError("Choose a restaurant to continue.");
        return;
      }

      await signInWithCredentials(normalized, password, branchId);
      writeRememberedLogin(normalized, branchId);
      navigate("/pos", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setSignInError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const showRestaurantPicker = restaurants.length > 1;

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-y-auto bg-[var(--pos-page)] text-[var(--pos-text-3)]">
      <div className="absolute right-[max(1rem,env(safe-area-inset-right,0px))] top-[max(1rem,env(safe-area-inset-top,0px))] z-20 lg:right-6 lg:top-6">
        <ThemeToggle />
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className={`relative z-10 m-6 hidden w-[min(420px,36vw)] shrink-0 flex-col justify-between rounded-[14px] bg-[var(--pos-sidebar)] p-10 lg:flex ${borderRest}`}
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
                Terminal
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
        className="relative z-10 flex min-h-full min-w-0 flex-1 items-center justify-center px-4 py-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-8"
      >
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 pr-12 sm:mb-10 lg:hidden">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[#1a1a18] ${borderRest}`}
            >
              <UtensilsCrossed className="size-5 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[18px] font-medium tracking-[-0.01em] text-[var(--pos-text-1)]">
                Steak & Marrow
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
                Terminal
              </p>
            </div>
          </div>

          <div
            className={`rounded-[14px] bg-[var(--pos-card)] p-5 sm:p-8 ${borderRest} ${borderHover} transition-[border-color] duration-150`}
          >
            <p className="text-[18px] font-medium tracking-[-0.01em] text-[var(--pos-text-1)]">
              Welcome back
            </p>
            <p className="mb-6 mt-1 text-[13px] text-[var(--pos-text-2)] sm:mb-8">
              Sign in to your restaurant
            </p>

            {signInError ? (
              <p
                className="mb-4 rounded-[9px] border border-solid border-[#f0c2c2] bg-[#fff5f5] px-3 py-2 text-[12px] text-[#b42318]"
                role="alert"
              >
                {signInError}
              </p>
            ) : null}

            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-icon-muted)]"
                  strokeWidth={2}
                />
                <input
                  ref={emailRef}
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  autoComplete="email"
                  className={`h-11 w-full rounded-[9px] border border-solid py-[9px] pl-10 pr-3 text-base [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] sm:h-9 sm:text-[13px] ${borderFocus} transition-[border-color] duration-150`}
                />
              </div>

              {showRestaurantPicker ? (
                <div>
                  <label
                    htmlFor="restaurant-select"
                    className="mb-1.5 block text-[11px] font-medium text-[var(--pos-text-2)]"
                  >
                    Restaurant
                  </label>
                  <SearchableSelect
                    id="restaurant-select"
                    value={selectedBranchId}
                    onChange={setSelectedBranchId}
                    placeholder="Select a restaurant"
                    className={`h-11 w-full rounded-[9px] border border-solid px-3 text-base [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] text-[var(--pos-text-1)] sm:h-9 sm:text-[13px] ${borderFocus}`}
                    options={[
                      { value: "", label: "Select a restaurant" },
                      ...restaurants.map((r) => ({ value: r.id, label: r.name })),
                    ]}
                    aria-label="Restaurant"
                  />
                </div>
              ) : null}

              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-icon-muted)]"
                  strokeWidth={2}
                />
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className={`h-11 w-full rounded-[9px] border border-solid py-[9px] pl-10 pr-10 text-base [border-color:var(--pos-input-border)] bg-[var(--pos-sidebar)] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] sm:h-9 sm:text-[13px] ${borderFocus} transition-[border-color] duration-150`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--pos-icon-muted)] transition-colors duration-150 hover:text-[var(--pos-text-2)]"
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
                className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--pos-primary-bg)] px-5 text-[13px] font-medium text-[var(--pos-primary-fg)] transition-[opacity,background-color] duration-150 hover:bg-[var(--pos-primary-hover)] disabled:opacity-60 sm:h-10"
              >
                {submitting ? "Signing in…" : "Sign in"}
                <ArrowRight className="size-4 shrink-0" strokeWidth={2} />
              </button>
            </form>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-[var(--pos-text-2)] lg:hidden">
            {isOnline ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-[#c8efd8] px-[10px] py-[3px] text-[11px] font-medium text-[#2e9b65]">
                <span className="size-[5px] shrink-0 rounded-full bg-[#2e9b65]" />
                Connected
              </span>
            ) : (
              <>
                <WifiOff className="size-3.5 text-[#e8472a]" strokeWidth={2} />
                <span className="text-[#e8472a]">Offline</span>
              </>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] text-[var(--pos-icon-muted)] sm:mt-6">
            By signing in, you agree to the terms of service.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
