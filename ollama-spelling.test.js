"use strict";
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {correctWithQwen,warmQwen} = require('./ollama-spelling');

test('Qwen calls the local 1.7B model with structured output and rejects overlapping requests', async t => {
  let resolve, request;
  t.mock.method(globalThis,'fetch',(url, options) => {
    assert.equal(url,'http://127.0.0.1:11434/api/chat');
    request = JSON.parse(options.body);
    return new Promise(done => { resolve = done; });
  });
  const pending = correctWithQwen('tôi muón M10');
  await assert.rejects(correctWithQwen('another'),{statusCode:503});
  assert.equal(request.model,'qwen3:1.7b');
  assert.equal(request.think,false); assert.equal(request.stream,false);
  assert.equal(request.keep_alive,-1);
  assert.deepEqual(request.format.required,['text']);
  assert.equal(request.messages[1].content,'tôi muón M10');
  resolve({ok:true,json:async()=>({done_reason:'stop',message:{content:JSON.stringify({text:'tôi muốn M10'})}})});
  assert.equal((await pending).candidates[0].text,'tôi muốn M10');
});

test('Qwen preload uses an empty request and keeps weights resident',async t=>{
  const mock = t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:11434/api/generate');
    assert.deepEqual(JSON.parse(options.body),{model:'qwen3:1.7b',stream:false,keep_alive:-1,options:{num_ctx:4096}});
    return {ok:true,json:async()=>({done:true})};
  });
  await warmQwen();
  mock.mock.mockImplementation(async()=>({ok:false,status:500}));
  await assert.rejects(warmQwen(),/Không nạp sẵn/);
  mock.mock.mockImplementation(async()=>({ok:true,json:async()=>({done:false})}));
  await assert.rejects(warmQwen(),/chưa xác nhận/);
});

test('Qwen reports missing service/model, timeouts and invalid responses, then permits retry', async t => {
  const mock = t.mock.method(globalThis,'fetch',async()=>{ throw Object.assign(new Error('fetch failed'),{cause:{code:'ECONNREFUSED'}}); });
  await assert.rejects(correctWithQwen('test'),{statusCode:422});
  mock.mock.mockImplementation(async()=>({ok:false,status:404}));
  await assert.rejects(correctWithQwen('test'),/setup:qwen/);
  mock.mock.mockImplementation(async()=>{ throw Object.assign(new Error('timeout'),{name:'TimeoutError'}); });
  await assert.rejects(correctWithQwen('test'),{statusCode:504});
  mock.mock.mockImplementation(async()=>({ok:false,status:500}));
  await assert.rejects(correctWithQwen('test'),/Ollama/);
  for (const data of [
    {done_reason:'length'}, {message:{content:'invalid'}},
    ...[null,{}, {text:''}, {text:123}, {text:'a'.repeat(10001)}].map(value=>({message:{content:JSON.stringify(value)}})),
  ]) {
    mock.mock.mockImplementation(async()=>({ok:true,json:async()=>data}));
    await assert.rejects(correctWithQwen('test'));
  }
  mock.mock.mockImplementation(async()=>({ok:true,json:async()=>({message:{content:'{"text":"test"}'}})}));
  assert.equal((await correctWithQwen('test')).candidates[0].model,'qwen3:1.7b');
});
