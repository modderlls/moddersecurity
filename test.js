import MaskedClient from "./src/index.js";

const client = new MaskedClient({
  serverUrl: "http://localhost:3000",
  aesKey: "zMt535w+nlIBRGAlN28WPG+s3k8snl+LKhtGt/A3b3A=" // serverdan olasan
});

(async () => {
  await client.connectWebSocket();
  await client.sendMaskedRequest("/real/posts");
})();
