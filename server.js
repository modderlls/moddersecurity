import express from "express";
import { WebSocketServer } from "ws";
import crypto from "crypto";

const app = express();
const PORT = 3000;

const AES_KEY = crypto.randomBytes(32); // 256-bit
const AES_KEY_BASE64 = AES_KEY.toString("base64");

// Dummy HTTP endpoint
app.get("/", (req, res) => {
  res.json({ status: "online" });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
  console.log(`AES key (send to client): ${AES_KEY_BASE64}`);
});

// WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  // Real ma'lumot
  const data = JSON.stringify([
    { id: 1, title: "Hi" },
    { id: 2, title: "World" }
  ]);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

  const payload = Buffer.concat([iv, encrypted]).toString("base64");

  // Yuborish
  ws.send(payload);
});
