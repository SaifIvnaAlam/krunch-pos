import { clsx } from 'clsx';
import * as React from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={clsx(
          'h-9 w-full rounded-[9px] border border-0 bg-chip px-3 text-[13px] text-ink placeholder:text-placeholder outline-none transition-colors focus:border-2 focus:border-white/30',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
