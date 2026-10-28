"use strict";
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const portable = path.resolve(__dirname,'..','.ollama','bin','ollama.exe');
const child = spawn(fs.existsSync(portable) ? portable : 'ollama',['pull','qwen3.5:2b'],{stdio:'inherit',windowsHide:true,env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434'}});
child.on('error',()=>{console.error('Cần cài Ollama và chạy npm run start:ollama trước.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code || 0;});
