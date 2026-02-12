import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';

let refreshInProgress = false;

/** Re-read .env.local and update process.env in-place. */
function reloadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#=][^=]*)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  } catch {
    // .env.local might not exist yet
  }
}

export async function POST() {
  if (refreshInProgress) {
    return NextResponse.json({ status: 'already_running' });
  }

  refreshInProgress = true;

  const child = spawn(
    process.execPath,
    ['--import', 'tsx', resolve(process.cwd(), 'scripts/grab-notion-token.ts')],
    { cwd: process.cwd(), stdio: 'inherit' },
  );

  child.on('close', (code) => {
    refreshInProgress = false;
    if (code === 0) {
      reloadEnv();
    }
  });

  child.on('error', () => {
    refreshInProgress = false;
  });

  return NextResponse.json({ status: 'started' });
}

export async function GET() {
  return NextResponse.json({ refreshInProgress });
}
