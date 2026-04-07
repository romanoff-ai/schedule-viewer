#!/usr/bin/env npx tsx
/**
 * Bootstrap Schedule Cookies
 * Opens OnTrack login in the OpenClaw browser, logs in, saves session cookies.
 * Run manually when cookies expire.
 *
 * Usage: npx tsx scripts/bootstrap-schedule-cookies.ts
 *
 * Requires: openclaw browser running with profile=openclaw
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIE_PATH = join(__dirname, 'schedule-tracker-cookies.json');
const CREDS_PATH = join(process.env.HOME || '~', '.openclaw', 'credentials.json');
const LOGIN_URL = 'https://www.heathandco.com/LaborProductivityTools/UserLogin.aspx';

async function main() {
  console.log('🔐 Bootstrap Schedule Cookies\n');

  // Check credentials
  if (!existsSync(CREDS_PATH)) {
    console.error('❌ No credentials.json found at', CREDS_PATH);
    console.error('   Add "ontrack" key with { "username": "...", "password": "..." }');
    process.exit(1);
  }

  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
  if (!creds.ontrack) {
    console.error('❌ No "ontrack" key in credentials.json');
    console.error('   Add: "ontrack": { "username": "YOUR_USER", "password": "YOUR_PASS" }');
    process.exit(1);
  }

  if (!creds.ontrack.username || !creds.ontrack.password) {
    console.error('❌ ontrack credentials missing username or password');
    process.exit(1);
  }

  console.log(`   Username: ${creds.ontrack.username}`);
  console.log(`   Login URL: ${LOGIN_URL}`);
  console.log('\n⚠️  This script requires the OpenClaw browser (profile=openclaw) to be running.');
  console.log('   Start it with: openclaw browser --browser-profile openclaw start');
  console.log('\n📌 Steps:');
  console.log('   1. Navigate to OnTrack login');
  console.log('   2. Fill in credentials');
  console.log('   3. Submit login');
  console.log('   4. Extract cookies');
  console.log('   5. Save to', COOKIE_PATH);
  console.log('\n🚀 This is a manual/agent-driven process.');
  console.log('   The agent (ROMANOFF) will use browser automation to complete login.');
  console.log('   Run this script, then have the agent handle browser steps.');

  // Output instructions for the agent
  console.log('\n--- AGENT INSTRUCTIONS ---');
  console.log(`1. browser open ${LOGIN_URL} profile=openclaw`);
  console.log(`2. Fill username: ${creds.ontrack.username}`);
  console.log(`3. Fill password: (from credentials)`);
  console.log('4. Submit the form');
  console.log('5. After login succeeds, extract cookies via browser console:');
  console.log('   document.cookie');
  console.log(`6. Save cookies to: ${COOKIE_PATH}`);
  console.log('   Format: { "cookies": "cookie_string_here", "savedAt": "ISO_DATE" }');
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
