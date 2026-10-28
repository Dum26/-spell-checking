"use strict";
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {correctWithQwen} = require('./ollama-spelling');

test('Qwen uses only the local 2B model, structured output and no thinking',async t=>{
  let resolve, request;
  t.mock.method(global,'fetch',(url,options)=>{request={url,...JSON.parse(options.body)};return new Promise(done=>{resolve=done;});});
  const pending=correctWithQwen('tôi muón M10');
  await assert.rejects(correctWithQwen('another'),{statusCode:503});
  resolve({ok:true,status:200,json:async()=>({message:{content:JSON.stringify({text:'tôi muốn M10'})},done_reason:'stop'})});
  const result=await pending;
  assert.equal(request.url,'http://127.0.0.1:11434/api/chat');
  assert.equal(request.model,'qwen3.5:2b'); assert.equal(request.think,false); assert.equal(request.stream,false);
  assert.equal(request.format.properties.text.type,'string'); assert.equal(request.messages.at(-1).content,'tôi muón M10');
  assert.equal(result.candidates[0].text,'tôi muốn M10'); assert.equal(result.candidates[0].model,'qwen3.5:2b');
});

test('Qwen reports missing service/model and rejects truncated or invalid output',async t=>{
  const fetch=t.mock.method(global,'fetch',async()=>{throw Object.assign(new Error('connect'),{cause:{code:'ECONNREFUSED'}});});
  await assert.rejects(correctWithQwen('test'),{statusCode:422});
  fetch.mock.mockImplementation(async()=>({ok:false,status:404}));
  await assert.rejects(correctWithQwen('test'),/ollama pull qwen3.5:2b/);
  fetch.mock.mockImplementation(async()=>({ok:true,status:200,json:async()=>({done_reason:'length',message:{content:'{}'}})}));
  await assert.rejects(correctWithQwen('test'),/cắt ngắn/);
  fetch.mock.mockImplementation(async()=>({ok:true,status:200,json:async()=>({message:{content:'{}'}})}));
  await assert.rejects(correctWithQwen('test'),/không hợp lệ/);
});
