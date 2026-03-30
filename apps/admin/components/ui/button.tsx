import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import * as React from 'react';

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-semibold transition-opacity duration-150 disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border-0 bg-white px-6 py-3 text-page hover:opacity-[0.88]',
        secondary:
          'border border-white/20 bg-transparent px-6 py-3 text-white hover:border-white/40',
        ghost:
          'border-0 bg-transparent px-0 py-2 text-body hover:text-white',
        smNav:
          'border-0 bg-white px-[18px] py-2 text-[13px] text-page hover:opacity-[0.88] rounded-[9px]',
      },
      size: {
        md: '',
        sm: 'px-4 py-[7px] text-[13px] rounded-md',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={clsx(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
}
