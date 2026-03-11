#!/usr/bin/env node
/**
 * Release script - bumps patch version, builds exe, creates GitHub release, uploads zip.
 * Usage: node scripts/release.js
 * Requires: GITHUB_TOKEN env var or hardcoded below.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const TOKEN = process.env.GITHUB_TOKEN || '';
const OWNER = 'Hodgy007';
const REPO = 'harpenden-arrows-handicap-timer';
const ZIP_PATH = path.join(__dirname, '../release/HarpendenArrowsRaceTimer.zip');
const PKG_PATH = path.join(__dirname, '../package.json');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

function apiRequest(method, endpoint, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'User-Agent': 'release-script',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...extraHeaders
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadAsset(uploadUrl, filePath) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const url = new URL(uploadUrl.replace('{?name,label}', `?name=${fileName}`));
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `token ${TOKEN}`,
        'User-Agent': 'release-script',
        'Content-Type': 'application/zip',
        'Content-Length': fileData.length
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(fileData);
    req.end();
  });
}

async function main() {
  if (!TOKEN) {
    console.error('Error: set GITHUB_TOKEN environment variable');
    process.exit(1);
  }

  // Bump patch version
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const parts = pkg.version.split('.').map(Number);
  parts[2]++;
  pkg.version = parts.join('.');
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`\nBumped version to ${pkg.version}`);

  const tag = `v${pkg.version}`;

  // Build
  console.log('\nBuilding...');
  run('npm run electron:dist');

  // Commit and push version bump
  console.log('\nCommitting version bump...');
  run(`git add package.json package-lock.json`);
  run(`git commit -m "Release ${tag}"`);
  run('git push');

  // Create GitHub release
  console.log('\nCreating GitHub release...');
  const release = await apiRequest('POST', `/repos/${OWNER}/${REPO}/releases`, {
    tag_name: tag,
    name: tag,
    body: `Harpenden Arrows Race Timer ${tag} - Windows desktop app`
  });

  if (release.errors) {
    console.error('Failed to create release:', release);
    process.exit(1);
  }

  console.log(`Release created: ${release.html_url}`);

  // Upload zip
  console.log('\nUploading zip...');
  const asset = await uploadAsset(release.upload_url, ZIP_PATH);
  console.log(`\nDone! Download: ${asset.browser_download_url}`);
}

main().catch(err => { console.error(err); process.exit(1); });
