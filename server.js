"use strict";
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { correctSpelling, stopSpellingAi } = require("./spelling-ai");
const { correctWithQwen } = require('./ollama-spelling');
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const assets = new Set(["index.html", "spellcheck.js", "spelling-dictionary.json", "tailwind.css", "fonts/InterVariable.woff2"]);
const types = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".woff2":"font/woff2"};
const server = http.createServer(async (request, response) => {
  const send = (status, data) => {
    response.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
    response.end(JSON.stringify(data));
  };
  let url;
  try { url = new URL(request.url, "http://localhost"); }
  catch { send(400, {error:"URL không hợp lệ."}); return; }
  if (url.pathname === "/api/spelling") {
    if (request.method !== "POST") { request.resume(); response.setHeader('Allow','POST'); send(405,{error:'Method not allowed'}); return; }
    const requestHost = request.headers.host || '', origin = request.headers.origin;
    if (!requestHost.endsWith(`:${server.address().port}`) || (origin && origin !== `http://${requestHost}` && origin !== `https://${requestHost}`)) {
      request.resume(); send(403,{error:'Chỉ xử lý văn bản từ ứng dụng.'}); return;
    }
    if (!/^application\/json(?:;.*)?$/iu.test(request.headers['content-type'] || '')) {
      request.resume(); send(415,{error:'Chỉ nhận JSON.'}); return;
    }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size <= 16000) chunks.push(chunk); }
      if (size > 16000) { send(413,{error:'Văn bản quá dài cho AI.'}); return; }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { send(400,{error:'JSON không hợp lệ.'}); return; }
      if (typeof payload?.text !== 'string' || !payload.text.trim() || payload.text.length > 2000 || payload.text.split(/\r\n|\r|\n/u).length > 12) {
        send(422,{error:'AI nhận tối đa 2.000 ký tự và 12 dòng mỗi lượt.'}); return;
      }
      const engine = payload.engine === undefined ? 'bartpho' : payload.engine;
      if (!['bartpho','qwen3.5'].includes(engine)) { send(400,{error:'Mô hình sửa chính tả không hợp lệ.'}); return; }
      const result = await (engine === 'qwen3.5' ? correctWithQwen(payload.text) : correctSpelling(payload.text));
      if (!response.destroyed) send(200,result);
    } catch (error) { if (!response.destroyed) send(error.statusCode || 500,{error:error.message}); }
    return;
  }
  if (!["GET","HEAD"].includes(request.method)) { request.resume(); send(404,{error:"Not found"}); return; }
  let relative;
  try { relative = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.slice(1)); }
  catch { send(400,{error:"URL không hợp lệ."}); return; }
  if (relative.split(/[\\/]/u).some(part => part.startsWith("."))) { send(403,{error:"Forbidden"}); return; }
  if (!assets.has(relative)) { send(404,{error:"Not found"}); return; }
  const file = path.resolve(__dirname,relative);
  if (!file.startsWith(__dirname + path.sep)) { send(403,{error:"Forbidden"}); return; }
  fs.stat(file,(error,stat) => {
    if (error || !stat.isFile()) { send(404,{error:"Not found"}); return; }
    response.writeHead(200,{"Content-Type":types[path.extname(file)] || "application/octet-stream", "Content-Length":stat.size,"Cache-Control":"no-cache","X-Content-Type-Options":"nosniff"});
    if (request.method === "HEAD") { response.end(); return; }
    const stream = fs.createReadStream(file);
    response.once("close",() => stream.destroy());
    stream.on("error",() => response.destroy());
    stream.pipe(response);
  });
});
if (require.main === module) {
  server.listen(port,host,() => console.log(`MECSU spelling ready at http://${host}:${port}`));
  for (const signal of ["SIGINT","SIGTERM"]) process.on(signal,() => { stopSpellingAi(); server.close(() => process.exit(0)); });
  process.on("exit",stopSpellingAi);
}
module.exports = server;
