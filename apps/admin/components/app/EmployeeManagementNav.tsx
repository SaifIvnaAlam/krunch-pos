'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { label: 'Employee List', href: '/app/team' },
  { label: 'Roster & Attendance', href: '/app/employees/roster' },
  { label: 'Leave', href: '/app/employees/leave' },
  { label: 'Payroll & Compensation', href: '/app/employees/payroll' },
] as const;

function linkActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/app/team') {
    return pathname === '/app/team' || pathname.startsWith('/app/team/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navItemClass =
  'block rounded-md px-3 py-2 text-[13px] transition-colors duration-150 hover:bg-elevated hover:text-white';
const subItemClass = `${navItemClass} pl-5 text-caption`;

export function EmployeeManagementNav() {
  const pathname = usePathname();
  const onEmployeeRoute = links.some((l) => linkActive(pathname, l.href));

  const [open, setOpen] = useState(onEmployeeRoute);

  useEffect(() => {
    if (onEmployeeRoute) setOpen(true);
  }, [onEmployeeRoute]);

  return (
    <div className="space-y-0">
      <button
        type="button"
        className={`${navItemClass} flex w-full items-center justify-between gap-2 text-left text-body`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Employee Management</span>
        <span
          className="text-[10px] text-label transition-transform duration-150"
          style={{ transform: open ? 'rotate(90deg)' : undefined }}
          aria-hidden
        >
          ›
        </span>
      </button>
      {open ? (
        <div className="mt-0.5 ml-3 space-y-0.5 border-l border-0 pl-1">
          {links.map((item) => {
            const active = linkActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${subItemClass} ${active ? 'bg-elevated text-white' : 'text-body'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
