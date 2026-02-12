#!/usr/bin/env npx tsx
/**
 * Automates grabbing the Notion token_v2 session cookie and space_id.
 *
 * Opens a Chromium window → you log in to Notion normally → the script
 * extracts token_v2 from cookies, fetches your space_id, and writes
 * both to .env.local.
 *
 * Usage:  npm run setup:token
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env.local');
const NOTION_URL = 'https://www.notion.so';

function updateEnvFile(updates: Record<string, string>) {
  let content = '';
  if (existsSync(ENV_PATH)) {
    content = readFileSync(ENV_PATH, 'utf-8');
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }
  }

  writeFileSync(ENV_PATH, content);
}

async function getSpaceId(tokenV2: string): Promise<string> {
  const res = await fetch(`${NOTION_URL}/api/v3/getSpaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `token_v2=${tokenV2}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`getSpaces failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<string, { space: Record<string, { value: { id: string; name: string } }> }>;

  // Collect all spaces across all user entries
  const spaces: { id: string; name: string }[] = [];
  for (const userEntry of Object.values(data)) {
    if (!userEntry.space) continue;
    for (const s of Object.values(userEntry.space)) {
      spaces.push({ id: s.value.id, name: s.value.name });
    }
  }

  if (spaces.length === 0) {
    throw new Error('No spaces found for this account');
  }

  if (spaces.length === 1) {
    console.log(`  Space: ${spaces[0].name} (${spaces[0].id})`);
    return spaces[0].id;
  }

  // Multiple spaces — pick the first and let the user know
  console.log(`  Found ${spaces.length} spaces:`);
  for (const s of spaces) {
    console.log(`    - ${s.name} (${s.id})`);
  }
  console.log(`  Using: ${spaces[0].name}`);
  return spaces[0].id;
}

async function main() {
  console.log('\n🔑 Notion Token Setup\n');
  console.log('A browser window will open. Log in to Notion if needed.');
  console.log('The script will automatically detect your session.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${NOTION_URL}/login`);

  // Wait for the token_v2 cookie to appear (means login succeeded)
  console.log('Waiting for login...');

  let tokenV2 = '';
  const timeout = 5 * 60 * 1000; // 5 minutes
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const cookies = await context.cookies(NOTION_URL);
    const tokenCookie = cookies.find((c) => c.name === 'token_v2');
    if (tokenCookie?.value) {
      tokenV2 = tokenCookie.value;
      break;
    }
    await page.waitForTimeout(1000);
  }

  await browser.close();

  if (!tokenV2) {
    console.error('\n❌ Timed out waiting for login (5 minutes). Try again.');
    process.exit(1);
  }

  console.log('\n✓ Got token_v2');

  // Fetch space ID
  console.log('Fetching workspace info...');
  const spaceId = await getSpaceId(tokenV2);

  // Write to .env.local
  updateEnvFile({
    NOTION_TOKEN_V2: tokenV2,
    NOTION_SPACE_ID: spaceId,
  });

  console.log(`\n✓ Written to ${ENV_PATH}`);
  console.log('\nDone! Restart your dev server to pick up the new tokens.\n');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
