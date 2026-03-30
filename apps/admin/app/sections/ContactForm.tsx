'use client';

import * as React from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export function ContactForm() {
  const [state, setState] = React.useState<
    | { status: 'idle' }
    | { status: 'sending' }
    | { status: 'sent' }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    setState({ status: 'sending' });
    const res = await fetch('/api/contact', { method: 'POST', body: formData });
    if (!res.ok) {
      const txt = await res.text();
      setState({
        status: 'error',
        message: txt || 'Something went wrong. Please try again.',
      });
      return;
    }
    setState({ status: 'sent' });
    form.reset();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <div className="mb-1 text-[12px] text-label">Name</div>
        <Input name="name" required placeholder="Your name" />
      </div>
      <div>
        <div className="mb-1 text-[12px] text-label">Email</div>
        <Input
          name="email"
          type="email"
          required
          placeholder="you@restaurant.com"
        />
      </div>
      <div>
        <div className="mb-1 text-[12px] text-label">Restaurant</div>
        <Input name="restaurant" placeholder="Restaurant or group name" />
      </div>
      <div>
        <div className="mb-1 text-[12px] text-label">Message</div>
        <textarea
          name="message"
          required
          placeholder="What are you trying to improve?"
          className="min-h-[120px] w-full resize-none rounded-[10px] border border-0 bg-chip px-3 py-2 text-[13px] leading-[1.7] text-white placeholder:text-placeholder outline-none transition-colors focus:border-2 focus:border-white/30"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" disabled={state.status === 'sending'}>
          {state.status === 'sending' ? 'Sending…' : 'Send message'}
        </Button>
        {state.status === 'sent' ? (
          <div className="text-[12px] text-caption">
            Message saved. We will follow up soon.
          </div>
        ) : null}
        {state.status === 'error' ? (
          <div className="text-[12px] text-[#bbb]">{state.message}</div>
        ) : null}
      </div>
    </form>
  );
}
