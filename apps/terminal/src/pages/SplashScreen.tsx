import { motion } from "framer-motion";
import { UtensilsCrossed } from "lucide-react";

const borderRest =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

export function SplashScreen() {
  return (
    <div className="relative flex h-full w-full flex-col bg-[var(--pos-page)] text-[var(--pos-text-3)]">
      <div className="flex flex-1 items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className={`flex w-full max-w-[400px] flex-col items-center rounded-[20px] bg-[var(--pos-card)] px-8 py-12 ${borderRest}`}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08, duration: 0.35 }}
            className={`mb-8 flex size-16 shrink-0 items-center justify-center rounded-[14px] bg-[#1a1a18] ${borderRest}`}
          >
            <UtensilsCrossed className="size-8 text-white" strokeWidth={2} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.35 }}
            className="text-center"
          >
            <h1 className="text-[32px] font-semibold leading-none tracking-[-0.03em] text-[var(--pos-text-1)]">
              Remi R-POS
            </h1>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
              Point of sale · Terminal
            </p>
            <p className="mt-6 text-[13px] font-normal leading-relaxed text-[var(--pos-text-2)]">
              Restaurant point of sale
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.3 }}
            className="relative mt-8 h-1 w-48 overflow-hidden rounded-full bg-[var(--pos-divider)]"
          >
            <motion.div
              className="absolute h-full w-[38%] rounded-full bg-[var(--pos-text-1)]"
              initial={{ left: "-38%" }}
              animate={{ left: "100%" }}
              transition={{
                repeat: Infinity,
                duration: 1.15,
                ease: "easeInOut",
              }}
            />
          </motion.div>
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="pb-8 text-center font-mono text-[11px] text-[var(--pos-icon-muted)]"
      >
        v0.1.0
      </motion.p>
    </div>
  );
}
