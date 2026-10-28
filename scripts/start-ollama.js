"use strict";
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const portable = path.join(root,'.ollama','bin','ollama.exe');
const child = spawn(fs.existsSync(portable) ? portable : 'ollama',['serve'], {
  cwd:root, stdio:'inherit', windowsHide:true,
  env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_MODELS:path.join(root,'.ollama','models'),OLLAMA_NO_CLOUD:'true',OLLAMA_CONTEXT_LENGTH:'2048',OLLAMA_NUM_PARALLEL:'1',OLLAMA_MAX_LOADED_MODELS:'1'},
});
child.on('error',()=>{console.error('Chưa có Ollama. Cài từ https://ollama.com/download/windows hoặc giải nén bản portable vào .ollama/bin.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code || 0;});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{
  if (process.platform === 'win32' && child.pid) spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
  child.kill();
});
