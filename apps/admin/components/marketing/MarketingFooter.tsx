const cols = [
  {
    title: 'Solutions',
    links: [
      ['Owner portal', '#platform'],
      ['Staff invites', '#workflow'],
      ['Multi-location', '#platform'],
      ['Roles & access', '#workflow'],
    ],
  },
  {
    title: 'Resources',
    links: [
      ['Pricing', '#pricing'],
      ['Contact', '#contact'],
      ['FAQ', '#faq'],
      ['Sign in', '/login'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['Krunch pos', '/'],
      ['Talk to sales', '#contact'],
    ],
  },
  {
    title: 'Legal',
    links: [
      ['Privacy', '#contact'],
      ['Terms', '#contact'],
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-0 bg-page">
      <div className="mx-auto max-w-content px-6 pb-10 pt-16">
        <div className="mb-12 text-base font-bold tracking-[-0.02em] text-white">
          Krunch pos
        </div>
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          {cols.map((c) => (
            <div key={c.title}>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-label">
                {c.title}
              </div>
              <ul className="mt-4 space-y-3">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-[13px] text-caption transition-colors duration-150 hover:text-[#aaa]"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-0 pt-8">
          <p className="text-[12px] text-muted">
            © {new Date().getFullYear()} Krunch pos. All rights reserved.
          </p>
          <div className="flex gap-6 text-[13px] text-caption">
            <a
              href="https://twitter.com"
              className="transition-colors hover:text-[#aaa]"
              rel="noreferrer"
            >
              X
            </a>
            <a
              href="https://linkedin.com"
              className="transition-colors hover:text-[#aaa]"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
