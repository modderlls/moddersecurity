#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pkg from '../package.json' assert { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMANDS = ['create', 'generate-key', 'help'];

/* ---------- UI Helpers ---------- */
function printHeader() {
  console.log(`\n🔐 mdsecure v${pkg.version}`);
  console.log(`Available commands:`);
  console.log(`  mdsecure create        → Setup secure WS + env`);
  console.log(`  mdsecure generate-key  → Generate MODDER_KEY and save to .env`);
  console.log(`  mdsecure help          → Show help info\n`);
}

/* ---------- ENV Helper ---------- */
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
  console.log(`🔐 Added ${key} to .env`);
}

/* ---------- Key Generator ---------- */
function generateAESKey() {
  return crypto.randomBytes(32).toString('base64');
}

/* ---------- package.json Updater ---------- */
function updatePackageJson() {
  const pkgPath = path.join(process.cwd(), 'package.json');
  let updated = false;

  if (fs.existsSync(pkgPath)) {
    try {
      const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      if (!pkgData.scripts) pkgData.scripts = {};

      if (!pkgData.scripts.start) {
        pkgData.scripts.start = 'node server.js';
        updated = true;
      }

      fs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2));
      if (updated) {
        console.log(`📦 package.json updated: "start" script added`);
      } else {
        console.log(`ℹ️ package.json already has a "start" script`);
      }
    } catch {
      console.error(`⚠️ Could not read package.json. Please add manually:`);
      console.log(`"scripts": { "start": "node server.js" }`);
    }
  } else {
    console.log(`⚠️ package.json not found.`);
    console.log(`Run "npm init -y" and then add:`);
    console.log(`"scripts": { "start": "node server.js" }`);
  }
}

/* ---------- server.js Template ---------- */
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

/* ---------- CLI Actions ---------- */
async function runCreate() {
  console.log('⚙️ Starting mdsecure setup...\n');
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'projectType',
      message: 'Do you want to create a new project or add to an existing one?',
      choices: ['New project', 'Add to existing']
    },
    {
      type: 'confirm',
      name: 'useSupabase',
      message: 'Will you use Supabase with this project?',
      default: false
    },
    {
      type: 'confirm',
      name: 'createTemplate',
      message: 'Generate example server.js template?',
      default: true
    }
  ]);

  const key = generateAESKey();
  ensureEnvKey('MODDER_KEY', key);

  updatePackageJson();

  if (answers.createTemplate) {
    createServerJs();
  }

  console.log('\n✅ Setup complete!');
  console.log('   Run the following to start:');
  console.log('   npm install');
  console.log('   npm start\n');
}

function runGenerateKey() {
  const key = generateAESKey();
  ensureEnvKey('MODDER_KEY', key);
  console.log(`🔑 New MODDER_KEY generated`);
}

function showHelp() {
  printHeader();
}

/* ---------- Main ---------- */
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
