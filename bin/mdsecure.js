#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import inquirer from 'inquirer';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const args = process.argv.slice(2);

const showHelp = () => {
  console.log(`\nmdsecure v${pkg.version}\n`);
  console.log(`Available commands:`);
  console.log(`  create        Yangi loyiha yoki mavjud loyihaga setup`);
  console.log(`  generate-key  MODDER_KEY uchun maxsus AES kalit yaratish`);
  console.log(`  help          Yordam\n`);
};

const generateKey = () => {
  const key = crypto.randomBytes(32).toString('base64');
  console.log(`\n🔑 Generated MODDER_KEY: ${key}\n`);

  if (fs.existsSync('.env')) {
    dotenv.config();
    fs.appendFileSync('.env', `\nMODDER_KEY=${key}\n`);
    console.log('✅ MODDER_KEY .env fayliga qo‘shildi');
  } else {
    fs.writeFileSync('.env', `MODDER_KEY=${key}\n`);
    console.log('✅ .env fayli yaratildi va MODDER_KEY qo‘shildi');
  }
};

const createProject = async () => {
  console.log("\n🚀 ModderSecure Setup\n");

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'projectType',
      message: '📂 Yangi loyiha yaratilsinmi yoki mavjud loyihaga qo‘shilsinmi?',
      choices: ['Yangi loyiha', 'Mavjud loyiha']
    },
    {
      type: 'confirm',
      name: 'supabase',
      message: '🔗 Supabase bilan ishlaysizmi?',
      default: true
    },
    {
      type: 'confirm',
      name: 'template',
      message: '📑 Template fayllar yaratiladimi?',
      default: true
    }
  ]);

  // 1. Agar yangi loyiha bo'lsa - papka yaratish
  if (answers.projectType === 'Yangi loyiha') {
    const { projectName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: '📛 Loyihaning nomi:',
        default: 'my-mdsecure-app'
      }
    ]);
    fs.mkdirSync(projectName, { recursive: true });
    process.chdir(projectName);
    console.log(`📂 Yangi loyiha papkasi yaratildi: ${projectName}`);
  }

  // 2. .env va MODDER_KEY
  const aesKey = crypto.randomBytes(32).toString('base64');
  fs.writeFileSync('.env', `MODDER_KEY=${aesKey}\n`);
  console.log('🔐 .env fayliga MODDER_KEY yaratildi');

  // 3. package.json
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) {
    const pkgTemplate = {
      name: 'mdsecure-project',
      version: '1.0.0',
      type: 'module',
      scripts: {
        start: 'node server.js'
      }
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkgTemplate, null, 2));
    console.log('📦 package.json yaratildi');
  }

  // 4. server.js
  const serverCode = `import WebSocket, { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const AES_KEY = Buffer.from(process.env.MODDER_KEY, 'base64');
const wss = new WebSocketServer({ port: 8080 });

function encrypt(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    content: encrypted,
    tag: authTag.toString('base64')
  };
}

wss.on('connection', ws => {
  console.log('✅ Client ulandi');

  ws.on('message', async message => {
    console.log('📩 Kelgan so‘rov:', message.toString());
    const payload = encrypt({ title: 'Hello', content: 'World', user_id: 1 });
    ws.send(JSON.stringify(payload));
  });
});

console.log('🚀 WebSocket server 8080-portda ishga tushdi');`;

  fs.writeFileSync('server.js', serverCode);
  console.log('🖥 server.js yaratildi');

  // 5. Template
  if (answers.template) {
    fs.mkdirSync('src', { recursive: true });
    fs.writeFileSync('src/index.js', `console.log("Hello ModderSecure!")`);
    console.log('📑 Template fayllar yaratildi');
  }

  console.log('\n✅ Setup tugadi! Endi:');
  console.log('   npm install');
  console.log('   npm start\n');
};

// Command ishlatish
if (!args.length || args[0] === 'help') {
  showHelp();
} else if (args[0] === 'generate-key') {
  generateKey();
} else if (args[0] === 'create') {
  createProject();
} else {
  console.log(`\n❌ Noma’lum command: ${args[0]}`);
  showHelp();
}
