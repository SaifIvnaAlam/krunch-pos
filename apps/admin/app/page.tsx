import type { ReactNode } from 'react';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { MarketingFooter } from '../components/marketing/MarketingFooter';
import { MarketingFAQ } from '../components/marketing/MarketingFAQ';
import { TrustTicker } from '../components/marketing/TrustTicker';
import { Button } from '../components/ui/button';
import { ContactForm } from './sections/ContactForm';

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-label">
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-page">
      <MarketingNav />

      {/* Hero */}
      <section className="relative min-h-[760px] overflow-hidden border-b border-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=2000&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-black/42" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.03)_0%,rgba(0,0,0,0.38)_58%,rgba(0,0,0,0.62)_100%)]" />

        <div className="relative mx-auto flex min-h-[760px] max-w-content flex-col justify-center px-6 pb-14 pt-28">
          <div className="max-w-[760px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">
              Owner portal + POS operations
            </p>
            <h1 className="mt-4 text-[clamp(36px,5vw,72px)] font-bold leading-[1.05] tracking-[-0.04em] text-white">
              When shifts get busy,
              <br />
              <span className="text-white/85">we keep your team aligned</span>
            </h1>
            <p className="mt-6 max-w-[620px] text-[15px] leading-[1.7] text-white/80">
              Krunch pos gives owners one place to create locations, invite
              staff, and control permissions so service runs cleanly across
              every branch.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#contact"
                className="inline-flex items-center rounded-[10px] bg-[#b9ff66] px-6 py-3 text-sm font-semibold text-black transition-opacity duration-150 hover:opacity-90"
              >
                Talk to sales
              </a>
              <a
                href="#workflow"
                className="inline-flex items-center rounded-[10px] border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/15"
              >
                See how it works
              </a>
            </div>
          </div>

          <div className="mt-16">
            <p className="text-center text-[12px] text-white/70">
              Trusted by restaurant teams and growing operators
            </p>
            <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 text-center md:grid-cols-5">
              {['bistro group', 'city dine', 'table one', 'forklane', 'olive room'].map(
                (logo) => (
                  <span
                    key={logo}
                    className="text-[26px] font-semibold tracking-[-0.03em] text-white/85"
                  >
                    {logo}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats row */}
      <section className="border-b border-0 bg-section-alt px-6 py-24">
        <div className="mx-auto max-w-content">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-bento border border-0 bg-card p-6 transition-[border-color] duration-200 hover:border-1 md:col-span-2">
              <p className="font-mono text-[clamp(32px,4vw,40px)] font-bold leading-none tracking-[-0.03em] text-white">
                Fewer voids, faster training
              </p>
              <p className="mt-3 max-w-[520px] text-[12px] leading-[1.6] text-muted">
                When everyone sees only what they need, you spend less time
                fixing permissions and more time on the floor.
              </p>
            </div>
            <div className="rounded-bento border border-0 bg-card p-6 transition-[border-color] duration-200 hover:border-1">
              <p className="font-mono text-[36px] font-bold text-white">2–5</p>
              <p className="mt-2 text-[12px] text-label">minutes to send invites</p>
            </div>
            <div className="rounded-bento border border-0 bg-card p-6 transition-[border-color] duration-200 hover:border-1">
              <p className="font-mono text-[36px] font-bold text-white">5</p>
              <p className="mt-2 text-[12px] text-label">starter role templates</p>
            </div>
          </div>
        </div>
      </section>

      {/* Bento — platform */}
      <section id="platform" className="border-b border-0 bg-page px-6 py-24">
        <div className="mx-auto max-w-content">
          <SectionLabel>Platform</SectionLabel>
          <h2 className="max-w-[600px] text-[clamp(28px,3.5vw,48px)] font-bold leading-[1.1] tracking-[-0.03em] text-white">
            Everything owners need to{' '}
            <span className="text-white/30">control access</span>
          </h2>
          <p className="mt-4 max-w-[480px] text-[15px] leading-[1.7] text-body">
            Bento-style layout: dense, readable, and built for scanning during a
            busy day.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-bento border border-0 bg-card p-6 transition-[border-color] duration-200 hover:border-1 md:col-span-2">
              <div className="grid gap-4 md:grid-cols-2 md:items-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-label">
                    Command center
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.01em] text-white">
                    Locations, invites, and roles in one place
                  </h3>
                  <p className="mt-2 text-[12px] leading-[1.6] text-caption">
                    Open the owner portal, pick a branch, invite staff with a
                    role attached. No shared passwords.
                  </p>
                </div>
                <div className="rounded-xl border border-0 bg-elevated p-4">
                  <div
                    className="mb-3 h-36 rounded-lg bg-cover bg-center"
                    style={{
                      backgroundImage:
                        "url('https://images.pexels.com/photos/3217156/pexels-photo-3217156.jpeg?auto=compress&cs=tinysrgb&w=1200')",
                    }}
                  />
                  <div className="flex gap-2">
                    <div className="h-24 flex-1 rounded-lg bg-sky-bg p-2 text-[11px] font-semibold text-sky-ink">
                      Orders
                    </div>
                    <div className="h-24 flex-1 rounded-lg bg-mint-bg p-2 text-[11px] font-semibold text-mint-ink">
                      Kitchen
                    </div>
                    <div className="h-24 flex-1 rounded-lg bg-peach-bg p-2 text-[11px] font-semibold text-peach-ink">
                      Register
                    </div>
                  </div>
                  <div className="mt-3 h-10 rounded-lg border border-0 bg-chip" />
                </div>
              </div>
            </div>
            <div className="rounded-bento border border-0 bg-card p-6 transition-[border-color] duration-200 hover:border-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-label">
                Invite engine
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Email plus role, tied to location
              </h3>
              <p className="mt-2 text-[12px] leading-[1.6] text-caption">
                Every invite carries context so the first login is already
                correct.
              </p>
            </div>
            <div className="rounded-bento border border-0 bg-card p-6 transition-[border-color] duration-200 hover:border-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-label">
                Multi-branch
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Repeat the same access model
              </h3>
              <p className="mt-2 text-[12px] leading-[1.6] text-caption">
                Add a new site without reinventing permissions from scratch.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Numbered feature strip */}
      <section id="workflow" className="border-b border-0 bg-section-alt px-6 py-24">
        <div className="mx-auto max-w-content">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="max-w-[600px] text-[clamp(28px,3.5vw,48px)] font-bold leading-[1.1] tracking-[-0.03em] text-white">
            Three steps from <span className="text-white/30">setup</span> to
            live service
          </h2>
          <p className="mt-4 max-w-[480px] text-[15px] leading-[1.7] text-body">
            Straight path: location, people, permissions.
          </p>
          <div className="mt-10 overflow-hidden rounded-xl border border-0">
            {[
              {
                n: '01',
                t: 'Create your location',
                b: 'Name, timezone, and address so reporting stays accurate.',
              },
              {
                n: '02',
                t: 'Invite your team',
                b: 'Send email invites with role presets for cashier, kitchen, manager.',
              },
              {
                n: '03',
                t: 'Go live on the floor',
                b: 'Staff sign in with scoped access. Owners keep full visibility.',
              },
            ].map((row) => (
              <div
                key={row.n}
                className="flex gap-4 border-b border-0 bg-card px-[22px] py-[18px] last:border-b-0"
              >
                <span className="min-w-[24px] text-[11px] font-bold text-label">
                  {row.n}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#e0e0e0]">{row.t}</p>
                  <p className="mt-1 text-[13px] leading-[1.6] text-caption">
                    {row.b}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust ticker */}
      <section className="border-b border-0 bg-page px-6 py-24">
        <div className="mx-auto max-w-content">
          <SectionLabel>Operators</SectionLabel>
          <h2 className="max-w-[600px] text-[clamp(28px,3.5vw,48px)] font-bold leading-[1.1] tracking-[-0.03em] text-white">
            Built for teams like yours
          </h2>
          <div className="mt-8">
            <TrustTicker />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-0 bg-section-alt px-6 py-24">
        <div className="mx-auto max-w-content">
          <SectionLabel>Pricing</SectionLabel>
          <h2 className="max-w-[640px] text-[clamp(28px,3.5vw,48px)] font-bold leading-[1.1] tracking-[-0.03em] text-white">
            Plans that scale with every location
          </h2>
          <p className="mt-4 max-w-[560px] text-[15px] leading-[1.7] text-body">
            Start where you are. Add registers, locations, and advanced controls
            when you are ready—no surprise lock-ins.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                name: 'Starter',
                price: 'From $79',
                period: '/ location / mo',
                blurb: 'Single venue teams getting invites and roles right.',
                features: [
                  'Up to 2 registers',
                  'Staff invites & basic roles',
                  'Email support',
                ],
                cta: 'Get started',
                featured: false,
              },
              {
                name: 'Growth',
                price: 'From $149',
                period: '/ location / mo',
                blurb: 'Multi-shift ops with tighter control and faster rollout.',
                features: [
                  'Up to 6 registers',
                  'Multi-location dashboard',
                  'Priority chat support',
                  'Custom permission sets',
                ],
                cta: 'Talk to sales',
                featured: true,
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                period: 'volume pricing',
                blurb: 'Franchise and multi-brand groups with dedicated rollout.',
                features: [
                  'Unlimited registers (fair use)',
                  'SSO & audit-friendly exports',
                  'Dedicated success manager',
                  'SLA options',
                ],
                cta: 'Request a quote',
                featured: false,
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`flex flex-col rounded-bento border p-7 ${
                  tier.featured
                    ? 'border-white/25 bg-card shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
                    : 'border-0 bg-card'
                }`}
              >
                {tier.featured ? (
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                    Most popular
                  </p>
                ) : null}
                <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                <p className="mt-1 text-[13px] leading-[1.5] text-caption">
                  {tier.blurb}
                </p>
                <div className="mt-6">
                  <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-white">
                    {tier.price}
                  </span>
                  <span className="ml-1.5 text-[12px] text-label">
                    {tier.period}
                  </span>
                </div>
                <ul className="mt-6 flex flex-1 flex-col gap-2.5 border-t border-0 pt-6">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex gap-2 text-[13px] leading-[1.5] text-body"
                    >
                      <span className="mt-0.5 shrink-0 text-white">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#contact"
                  className={`mt-8 inline-flex w-full items-center justify-center rounded-[10px] px-5 py-3 text-sm font-semibold transition-opacity duration-150 hover:opacity-90 ${
                    tier.featured
                      ? 'bg-white text-black'
                      : 'border border-white/25 bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-[12px] text-caption">
            Prices shown are illustrative. Final billing depends on registers,
            modules, and contract term—we will confirm in your intro call.
          </p>
        </div>
      </section>

      {/* Testimonial + stats */}
      <section id="proof" className="border-b border-0 bg-section-alt px-6 py-24">
        <div className="mx-auto max-w-content">
          <div className="rounded-bento border border-0 bg-card p-7">
            <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div
                className="h-36 rounded-xl border border-0 bg-cover bg-center"
                style={{
                  backgroundImage:
                    "url('https://images.pexels.com/photos/2878744/pexels-photo-2878744.jpeg?auto=compress&cs=tinysrgb&w=1200')",
                }}
              />
              <div
                className="h-36 rounded-xl border border-0 bg-cover bg-center"
                style={{
                  backgroundImage:
                    "url('https://images.pexels.com/photos/8629039/pexels-photo-8629039.jpeg?auto=compress&cs=tinysrgb&w=1200')",
                }}
              />
              <div
                className="h-36 rounded-xl border border-0 bg-cover bg-center"
                style={{
                  backgroundImage:
                    "url('https://images.pexels.com/photos/8845968/pexels-photo-8845968.jpeg?auto=compress&cs=tinysrgb&w=1200')",
                }}
              />
            </div>
            <blockquote className="text-[15px] italic leading-[1.8] text-[#bbb]">
              We stopped handing out one shared login. Invites plus roles meant
              new servers were productive on night one instead of week two.
            </blockquote>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2f6dae] text-[12px] font-semibold text-white">
                M
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">Maya Chen</p>
                <p className="text-[11px] text-caption">Operations director</p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-6 border-t border-0 pt-8 md:grid-cols-3">
              {[
                { v: '−40%', l: 'fewer permission tickets' },
                { v: '3×', l: 'faster staff onboarding' },
                { v: '24/7', l: 'owner visibility into access' },
              ].map((s) => (
                <div key={s.l}>
                  <p className="font-mono text-2xl font-bold text-white">{s.v}</p>
                  <p className="mt-1 text-[10px] leading-[1.4] text-label">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-0 bg-page px-6 py-24">
        <div className="mx-auto max-w-content">
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="max-w-[600px] text-[clamp(28px,3.5vw,48px)] font-bold leading-[1.1] tracking-[-0.03em] text-white">
            Questions we hear most
          </h2>
          <div className="mt-8">
            <MarketingFAQ />
          </div>
        </div>
      </section>

      {/* Contact + CTA */}
      <section id="contact" className="border-b border-0 bg-section-alt px-6 py-24">
        <div className="mx-auto max-w-content">
          <div className="rounded-bento border border-0 bg-card p-8 md:p-10">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-start">
              <div>
                <SectionLabel>Contact</SectionLabel>
                <div
                  className="mb-4 h-44 rounded-xl border border-0 bg-cover bg-center"
                  style={{
                    backgroundImage:
                      "url('https://images.pexels.com/photos/1267320/pexels-photo-1267320.jpeg?auto=compress&cs=tinysrgb&w=1200')",
                  }}
                />
                <h2 className="text-[clamp(28px,3.5vw,48px)] font-bold leading-[1.1] tracking-[-0.03em] text-white">
                  Talk to sales
                </h2>
                <p className="mt-4 text-[15px] leading-[1.7] text-body">
                  Tell us about your service model and locations. We will map
                  roles, rollout order, and what your managers need to see on day
                  one.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild>
                    <a href="/login">Sign in</a>
                  </Button>
                  <Button variant="secondary" asChild>
                    <a href="/app">Open portal demo</a>
                  </Button>
                </div>
              </div>
              <div className="rounded-bento border border-0 bg-elevated p-6">
                <ContactForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
