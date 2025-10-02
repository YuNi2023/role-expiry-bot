// health.js（依存ゼロ）
const http = require('http');
http.createServer((_req, res) => {
  res.writeHead(200, {'Content-Type':'text/plain'}); res.end('ok');
}).listen(process.env.PORT || 3000);
