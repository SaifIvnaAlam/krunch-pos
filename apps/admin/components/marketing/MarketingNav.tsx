'use client';

import * as React from 'react';
import { Button } from '../ui/button';

const links = [
  { href: '#platform', label: 'Platform' },
  { href: '#workflow', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#proof', label: 'Proof' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contact', label: 'Contact' },
];

export function MarketingNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 h-[60px] border-b border-0 bg-page/85 backdrop-blur-[12px]">
      <div className="mx-auto flex h-full max-w-content items-center justify-between px-6">
        <a
          href="/"
          className="text-base font-bold tracking-[-0.02em] text-white"
        >
          Krunch pos
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13px] text-body transition-colors duration-150 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-6 md:flex">
          <a
            href="/login"
            className="text-[13px] text-body transition-colors duration-150 hover:text-white"
          >
            Sign in
          </a>
          <Button variant="smNav" asChild>
            <a href="#contact">Talk to sales</a>
          </Button>
        </div>

        <button
          type="button"
          className="text-[13px] font-semibold text-body md:hidden"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          Menu
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-page md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-[60px] items-center justify-between border-b border-0 px-6">
            <span className="text-base font-bold text-white">Krunch pos</span>
            <button
              type="button"
              className="text-[13px] font-semibold text-body"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              Close
            </button>
          </div>
          <nav className="flex flex-col gap-1 p-6">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="py-3 text-[15px] text-body"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <a
              href="/login"
              className="py-3 text-[15px] text-body"
              onClick={() => setOpen(false)}
            >
              Sign in
            </a>
            <div className="pt-4">
              <Button className="w-full" asChild>
                <a href="#contact" onClick={() => setOpen(false)}>
                  Talk to sales
                </a>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
