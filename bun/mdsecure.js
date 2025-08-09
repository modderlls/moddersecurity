#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';

async function main() {
  console.log('\nWelcome to mdsecure setup!\n');

  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'createPackageJson',
      message: 'Create package.json (if not exists)?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'createTemplate',
      message: 'Create Next.js app/page.js template?',
      default: true,
    },
    {
      type: 'input',
      name: 'supabaseUrl',
      message: 'Enter Supabase URL:',
      validate: (input) => input.startsWith('https://') || 'Invalid URL',
    },
    {
      type: 'input',
      name: 'supabaseKey',
      message: 'Enter Supabase Service Role Key:',
      validate: (input) => input.length > 0 || 'Key cannot be empty',
    },
  ]);

  if (answers.createPackageJson) {
    if (!fs.existsSync('package.json')) {
      const pkg = {
        name: 'mdsecure-app',
        version: '0.1.0',
        private: true,
        scripts: {
          dev: 'node server.js',
          build: 'next build',
          start: 'NODE_ENV=production node server.js',
        },
        dependencies: {
          next: '^15.4.6',
          react: '^19.1.0',
          'react-dom': '^19.1.0',
          ws: '^8.18.3',
          '@supabase/supabase-js': '^2.30.0',
          dotenv: '^17.2.1',
        },
      };
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
      console.log('package.json created');
    } else {
      console.log('package.json already exists, skipping');
    }
  }

  if (answers.createTemplate) {
    const appDir = path.join(process.cwd(), 'app');
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir);
    }
    const pageJs = `\
'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000');

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
          return;
        }
        setPosts(Array.isArray(data) ? data : []);
      } catch (e) {
        setError('Invalid data from server');
        setPosts([]);
      }
    };

    ws.onerror = () => setError('WebSocket error');
    ws.onclose = () => console.log('WebSocket closed');

    return () => ws.close();
  }, []);

  if (error) {
    return <div style={{ color: 'red', padding: 20 }}>Error: {error}</div>;
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>Supabase Posts</h1>
      <ul>
        {posts.length === 0 && <li>No posts yet</li>}
        {posts.map((post, i) => (
          <li key={i}>
            <b>Title:</b> {post.title} <br />
            <b>Content:</b> {post.content} <br />
            <b>User ID:</b> {post.user_id}
          </li>
        ))}
      </ul>
    </main>
  );
}
`;
    fs.writeFileSync(path.join(appDir, 'page.js'), pageJs);
    console.log('Next.js template created at app/page.js');
  }

  const envContent = `NEXT_PUBLIC_SUPABASE_URL=${answers.supabaseUrl}
SUPABASE_SERVICE_ROLE_KEY=${answers.supabaseKey}
`;
  fs.writeFileSync('.env.local', envContent);
  console.log('.env.local created');

  const serverJs = `\
import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', async (ws) => {
    console.log('WS client connected');

    try {
      const { data, error } = await supabase
        .from('posts')
        .select('title, content, user_id');

      if (error) {
        console.error('Supabase error:', error);
        ws.send(JSON.stringify({ error: 'Failed to fetch posts' }));
        return;
      }

      ws.send(JSON.stringify(data));
    } catch (err) {
      console.error('WS error:', err);
      ws.send(JSON.stringify({ error: 'Internal server error' }));
    }

    ws.on('close', () => {
      console.log('WS client disconnected');
    });
  });

  server.listen(port, () => {
    console.log(\`> Ready on http://localhost:\${port}\`);
  });
});
`;
  fs.writeFileSync('server.js', serverJs);
  console.log('server.js created');

  console.log('\nSetup complete! Run "npm install" then "npm run dev" to start your app.');
}

main();
