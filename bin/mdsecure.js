#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const COMMANDS = ['create', 'generate-key', 'help'];

function printHeader() {
  console.log(`\n🔐 mdsecure v${pkg.version}`);
  console.log(`Available commands:`);
  console.log(`  mdsecure create        → Setup secure WS + env`);
  console.log(`  mdsecure generate-key  → Generate MODDER_KEY and save to .env`);
  console.log(`  mdsecure help          → Show help info\n`);
}

function ensureEnvKey(key, value) {
  const envPath = path.resolve(process.cwd(), '.env');
  let envData = '';
  if (fs.existsSync(envPath)) {
    envData = fs.readFileSync(envPath, 'utf8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envData)) {
      envData = envData.replace(regex, `${key}="${value}"`);
    } else {
      envData += `\n${key}="${value}"`;
    }
  } else {
    envData = `${key}="${value}"`;
  }
  fs.writeFileSync(envPath, envData.trim() + '\n');
  console.log(`✅ Saved ${key} to .env`);
}

function generateAESKey() {
  return crypto.randomBytes(32).toString('base64');
}

/** 
 * Updated function that replaces dev and start scripts exactly as requested,
 * keeps other scripts intact.
 */
function updatePackageJson() {
  const projectDir = process.cwd();
  const pkgPath = path.join(projectDir, 'package.json');
  let updated = false;

  if (fs.existsSync(pkgPath)) {
    try {
      const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      if (!pkgData.scripts) {
        pkgData.scripts = {};
      }

      // Set dev and start scripts exactly as requested:
      const newDevScript = 'node server.js';
      const newStartScript = 'NODE_ENV=production node server.js';

      if (pkgData.scripts.dev !== newDevScript) {
        pkgData.scripts.dev = newDevScript;
        updated = true;
      }

      if (pkgData.scripts.start !== newStartScript) {
        pkgData.scripts.start = newStartScript;
        updated = true;
      }

      // Note: We keep other scripts intact, e.g. build, lint, etc.

      if (updated) {
        fs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2));
        console.log(`✅ package.json updated with custom "dev" and "start" scripts`);
      } else {
        console.log(`ℹ️ package.json already has desired "dev" and "start" scripts`);
      }
    } catch (err) {
      console.error(`⚠️ Could not read package.json. Please add these scripts manually:`);
      console.log(`"scripts": {`);
      console.log(`  "dev": "node server.js",`);
      console.log(`  "start": "NODE_ENV=production node server.js"`);
      console.log(`}`);
    }
  } else {
    console.log(`⚠️ package.json not found. Run "npm init -y" then add:`);
    console.log(`"scripts": {`);
    console.log(`  "dev": "node server.js",`);
    console.log(`  "start": "NODE_ENV=production node server.js"`);
    console.log(`}`);
  }
}

function createServerJs() {
  const serverContent = `
import WebSocket, { WebSocketServer } from 'ws';
import 'dotenv/config';
import CryptoJS from 'crypto-js';

const wss = new WebSocketServer({ port: 3000 });
console.log('✅ WebSocket server running on ws://localhost:3000');

const AES_KEY = CryptoJS.enc.Base64.parse(process.env.MODDER_KEY);

wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    if (msg.toString() === 'fetchPosts') {
      const payload = [{ title: 'Hello', content: 'Secure World', user_id: 1 }];
      const iv = CryptoJS.lib.WordArray.random(16);
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(payload), AES_KEY, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      ws.send(JSON.stringify({
        iv: CryptoJS.enc.Base64.stringify(iv),
        data: encrypted.ciphertext.toString(CryptoJS.enc.Base64)
      }));
    }
  });
});
`.trim();

  fs.writeFileSync(path.resolve(process.cwd(), 'server.js'), serverContent);
  console.log('🖥 server.js created');
}

async function runCreate() {
  console.log('⚙️ mdsecure setup starting...\n');
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'projectType',
      message: 'Do you want to create a new project or add to existing?',
      choices: ['New project', 'Add to existing']
    },
    {
      type: 'confirm',
      name: 'useSupabase',
      message: 'Is Supabase configured in this project?',
      default: false
    },
    {
      type: 'confirm',
      name: 'createTemplate',
      message: 'Generate example template files?',
      default: true
    }
  ]);

  const key = generateAESKey();
  ensureEnvKey('MODDER_KEY', key);

  updatePackageJson();

  if (answers.createTemplate) {
    createServerJs();
  }

  console.log('\n✅ Setup complete! Run:\n   npm install\n   npm run dev');
}

function runGenerateKey() {
  const key = generateAESKey();
  ensureEnvKey('MODDER_KEY', key);
  console.log(`🔑 Generated new MODDER_KEY`);
}

function showHelp() {
  printHeader();
}

async function main() {
  const [, , cmd] = process.argv;
  printHeader();

  if (!cmd || !COMMANDS.includes(cmd)) {
    console.log('❌ Unknown or missing command.\n');
    showHelp();
    process.exit(1);
  }

  if (cmd === 'create') {
    await runCreate();
  } else if (cmd === 'generate-key') {
    runGenerateKey();
  } else if (cmd === 'help') {
    showHelp();
  }
}

main();
