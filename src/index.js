import CryptoJS from 'crypto-js';

export default class MaskedClient {
  /**
   * @param {Object} options
   * @param {string} options.serverUrl  - Masalan: 'https://example.com'
   * @param {string} options.aesKey     - Base64 formatidagi 256-bit AES kaliti
   */
  constructor({ serverUrl, aesKey }) {
    this.serverUrl = serverUrl.replace(/\/+$/, ''); // oxirgi slash olib tashlash
    this.aesKey = CryptoJS.enc.Base64.parse(aesKey);
    this.ws = null;
    this.onMessageCallback = null;
  }

  /**
   * WebSocket ulanishini o'rnatadi va kelayotgan xabarlarni decrypt qiladi
   * @returns {Promise<void>}
   */
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      const protocol = this.serverUrl.startsWith('https') ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${this.serverUrl.replace(/^https?:\/\//, '')}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = (err) => {
        reject(err);
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const iv = CryptoJS.enc.Base64.parse(payload.iv);
          const encryptedData = payload.data;

          const decrypted = CryptoJS.AES.decrypt(encryptedData, this.aesKey, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
          });

          const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);

          if (this.onMessageCallback) {
            this.onMessageCallback(decryptedText);
          }
        } catch (e) {
          console.error('Decryption error:', e);
        }
      };
    });
  }

  /**
   * HTTP orqali soxta (masklangan) request yuboradi
   * Frontend devtools’da faqat dummy javob ko‘rinadi
   * @param {Object} payloadObj - JSON obyekti (masalan: { target: 'supabase://rest/v1/posts?select=*', ts: Date.now(), ... })
   * @returns {Promise<Object>} - Javob JSON formatda
   */
  async sendMaskedRequest(payloadObj) {
    const jsonString = JSON.stringify(payloadObj);
    const base64Payload = btoa(jsonString);
    const url = `${this.serverUrl}/?request=${encodeURIComponent(base64Payload)}`;

    const res = await fetch(url);
    return res.json();
  }

  /**
   * Callback funksiyani o'rnatadi, decrypt qilingan ma'lumotni olish uchun
   * @param {(message: string) => void} cb
   */
  onMessage(cb) {
    this.onMessageCallback = cb;
  }

  /**
   * WebSocket ulanishini uzadi
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
