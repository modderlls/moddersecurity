#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMANDS = ['create', 'generate-key', 'help'];

function printHeader() {
  console.log(`\n🔐 mdsecure CLI v1.0.22`);
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

function updatePackageJson() {
  const projectDir = process.cwd();
  const pkgPath = path.join(projectDir, 'package.json');
  let updated = false;

  if (fs.existsSync(pkgPath)) {
    try {
      const pkgDataRaw = fs.readFileSync(pkgPath, 'utf8');
      const pkgData = JSON.parse(pkgDataRaw);

      // Qo'shish yoki yangilash type: module
      if (pkgData.type !== 'module') {
        pkgData.type = 'module';
        updated = true;
        console.log(`✅ Added "type": "module" to package.json`);
      } else {
        console.log(`ℹ️ package.json already has "type": "module"`);
      }

      if (!pkgData.scripts) pkgData.scripts = {};

      // Skriptlarni yangilash yoki qo'shish
      const devScript = 'node server.js';
      const startScript = 'NODE_ENV=production node server.js';

      if (pkgData.scripts.dev !== devScript) {
        pkgData.scripts.dev = devScript;
        updated = true;
      }
      if (pkgData.scripts.start !== startScript) {
        pkgData.scripts.start = startScript;
        updated = true;
      }

      fs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2));
      if (updated) {
        console.log(`✅ package.json updated with "type" and "scripts"`);
      } else {
        console.log(`ℹ️ package.json already has required scripts`);
      }
    } catch (err) {
      console.error(`⚠️ Error parsing package.json. Please update manually:`);
      console.log(`Add "type": "module" and scripts:`);
      console.log(`"scripts": { "dev": "node server.js", "start": "NODE_ENV=production node server.js" }`);
    }
  } else {
    console.log(`⚠️ package.json not found. Run "npm init -y" and add:`);
    console.log(`"type": "module"`);
    console.log(`"scripts": { "dev": "node server.js", "start": "NODE_ENV=production node server.js" }`);
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
      // TODO: Bu joyga Supabase dan haqiqiy ma'lumot olishni qo'shishingiz mumkin
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

  console.log('\n✅ Setup complete! Run:');
  console.log('   npm install');
  console.log('   npm run dev');
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
