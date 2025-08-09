// src/index.js
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';

export function createMDServer({ supabaseUrl, supabaseKey, port = 3000 }) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const wss = new WebSocketServer({ port });

  wss.on('connection', async (ws) => {
    console.log('WS client connected');

    try {
      const { data, error } = await supabase
        .from('posts')
        .select('title, content, user_id');

      if (error) {
        ws.send(JSON.stringify({ error: 'Failed to fetch posts' }));
        return;
      }

      ws.send(JSON.stringify(data));
    } catch (err) {
      ws.send(JSON.stringify({ error: 'Internal server error' }));
    }

    ws.on('close', () => {
      console.log('WS client disconnected');
    });
  });

  return wss;
}
