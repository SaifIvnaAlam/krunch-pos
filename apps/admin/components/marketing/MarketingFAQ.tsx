'use client';

import * as React from 'react';

const faqs = [
  {
    q: 'How long does setup take for a new location?',
    a: 'Most teams add a location, invite staff, and assign roles in under ten minutes. Larger rollouts are usually limited by hardware delivery, not software setup.',
  },
  {
    q: 'Do I need technical staff to manage Krunch pos?',
    a: 'No. The owner portal is built for restaurant operators. Invites and roles are designed to be understandable without IT involvement.',
  },
  {
    q: 'How is this different from a generic POS admin panel?',
    a: 'Krunch pos centers on invite-based access and role templates tuned for service: cashier, kitchen, manager, owner. The goal is fewer permission mistakes during rush.',
  },
  {
    q: 'Can we run multiple branches from one account?',
    a: 'Yes. Locations are first-class. You can repeat the same access model across branches without rebuilding permissions from scratch each time.',
  },
];

export function MarketingFAQ() {
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <div className="overflow-hidden rounded-xl border border-0">
      {faqs.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className="border-b border-0 bg-card last:border-b-0"
          >
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-[22px] py-[18px] text-left"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
            >
              <span className="text-[14px] text-[#ccc]">{item.q}</span>
              <span className="shrink-0 text-lg text-muted">
                {isOpen ? '−' : '+'}
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
              style={{
                gridTemplateRows: isOpen ? '1fr' : '0fr',
              }}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="px-[22px] pb-[18px] text-[13px] leading-[1.7] text-caption">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
