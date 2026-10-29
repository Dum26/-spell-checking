"use strict";
const { spawn } = require('node:child_process');
const path = require('node:path');
let worker, workerPid, pending, buffer = '';

function stopSpellingAi() {
  const child = worker;
  worker = undefined;
  if (process.platform === 'win32' && workerPid) spawn('taskkill', ['/PID', String(workerPid), '/T', '/F'], {windowsHide:true, stdio:'ignore'}).on('error', () => {});
  child?.kill(); workerPid = undefined;
  if (pending) { const task = pending; pending = undefined; clearTimeout(task.timer); task.reject(new Error('AI đã dừng.')); }
}
function requestSpellingAi(payload, timeoutMs) {
  if (pending) return Promise.reject(Object.assign(new Error('AI đang xử lý lượt trước; vui lòng thử lại.'), {statusCode:503}));
  if (!worker) {
    const python = process.env.SPELLING_PYTHON || path.join(__dirname, '.venv-spelling', 'Scripts', 'python.exe');
    const child = spawn(python, ['-u', path.join(__dirname, 'scripts', 'spelling-ai.py')], {cwd:__dirname, windowsHide:true, stdio:['pipe','pipe','pipe']});
    worker = child; buffer = '';
    child.stdout.setEncoding('utf8');
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.stdout.on('data', chunk => {
      if (worker !== child) return;
      buffer += chunk.toString('utf8');
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end+1);
        let response;
        try { response = JSON.parse(line); } catch { continue; }
        if (response.ready) { workerPid = response.pid; continue; }
        if (!pending) continue;
        const task = pending; pending = undefined; clearTimeout(task.timer);
        if (response.error) task.reject(Object.assign(new Error(response.error), {statusCode:response.status || 500}));
        else task.resolve(response);
      }
    });
    child.once('error', () => { if (worker === child) stopSpellingAi(); });
    child.once('exit', () => { if (worker === child) stopSpellingAi(); });
    child.stdin.on('error', () => { if (worker === child) stopSpellingAi(); });
  }
  return new Promise((resolve, reject) => {
    pending = {resolve,reject,timer:setTimeout(stopSpellingAi,timeoutMs)};
    worker.stdin.write(JSON.stringify(payload) + '\n');
  });
}
function correctSpelling(text, engine = 'bartpho') {
  if (!['bartpho','vn-base','bartpho-protonx'].includes(engine)) return Promise.reject(Object.assign(new Error('Mô hình sửa chính tả không hợp lệ.'), {statusCode:400}));
  return requestSpellingAi({text,engine},120000);
}
function warmSpellingAi() { return requestSpellingAi({warmup:true},300000); }
module.exports = {correctSpelling, warmSpellingAi, stopSpellingAi};
