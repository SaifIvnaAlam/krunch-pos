import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(req: Request) {
  const form = await req.formData();
  const payload = {
    name: String(form.get('name') || '').trim(),
    email: String(form.get('email') || '').trim(),
    restaurant: String(form.get('restaurant') || '').trim(),
    message: String(form.get('message') || '').trim(),
    createdAt: new Date().toISOString(),
  };

  if (!payload.name || !payload.email || !payload.message) {
    return new NextResponse('Missing required fields.', { status: 400 });
  }

  const outDir = path.join(process.cwd(), '.data');
  const outFile = path.join(outDir, 'contact-messages.jsonl');
  await fs.mkdir(outDir, { recursive: true });
  await fs.appendFile(outFile, JSON.stringify(payload) + '\n', 'utf8');

  return NextResponse.json({ ok: true });
}

