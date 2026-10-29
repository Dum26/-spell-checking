"use strict";
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('automatic AI preserves newer input, copies the displayed result and can be disabled', async () => {
  const nodes = new Map();
  const element = () => ({value:'',textContent:'',checked:true,events:{},children:[],get childElementCount() {return this.children.length;},replaceChildren() {this.children=[];},append(child) {this.children.push(child);},addEventListener(name,fn) { this.events[name]=fn; }});
  for (const id of ['spell-input','spell-output','spell-status','spell-copy','spell-ai','spell-engine','spell-engine-help','spell-suggestions','spell-model-status']) {
    nodes.set('#'+id, element());
  }
  nodes.get('#spell-engine').value='bartpho';
  let now = 0, timerId = 0, copied, modelChecks = 0;
  const timers = new Map(), requests = [];
  const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
  const advance = async milliseconds => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    await flush();
  };
  vm.runInNewContext(fs.readFileSync('spellcheck.js','utf8'), {
    document:{querySelector:id => nodes.get(id),createElement:element}, performance:{now:()=>now}, AbortController,
    navigator:{clipboard:{writeText:async text => { copied=text; }}},
    setTimeout:(fn,ms) => { const id=++timerId; timers.set(id,{fn,at:now+ms}); return id; },
    clearTimeout:id => timers.delete(id),
    fetch:(url,options) => {
      if (url === '/api/models') return Promise.resolve({ok:true,json:async()=>({status:++modelChecks===1 ? 'loading' : 'ready'})});
      if (url === '/spelling-dictionary.json') return Promise.resolve({ok:true,json:async()=>({terms:['muốn','bu lông'],variants:[]})});
      return new Promise(resolve => requests.push({options,resolve}));
    },
  });
  await flush();
  assert.match(nodes.get('#spell-model-status').textContent,/Đang nạp sẵn/);
  const input = nodes.get('#spell-input'), output = nodes.get('#spell-output'), ai = nodes.get('#spell-ai');
  const type = async text => { input.value=text; input.events.input(); await advance(300); };
  await type('tans khoas M10'); await advance(1000);
  assert.equal(output.textContent,'tán khoá M10'); assert.equal(requests.length,0);
  await type('muón M10'); await advance(1000);
  assert.equal(requests.length,1);
  assert.equal(JSON.parse(requests[0].options.body).text,'muón M10');
  await type('cắt M10');
  assert.ok(requests[0].options.signal.aborted);
  requests[0].resolve({ok:true,json:async()=>({candidates:[{model:'bartpho',text:'muốn M10'}],elapsedMs:20})});
  await flush(); assert.equal(output.textContent,'cắt M10');
  await type('muón M10'); await advance(1000);
  requests[1].resolve({ok:true,json:async()=>({candidates:[{model:'bartpho',text:'muốn M10'}],elapsedMs:20})});
  await flush(); assert.equal(output.textContent,'muốn M10'); assert.equal(input.value,'muón M10');
  await nodes.get('#spell-copy').events.click(); assert.equal(copied,'muốn M10');
  await type('tans muón M10'); await advance(1000);
  assert.equal(JSON.parse(requests[2].options.body).text, 'tans muón M10', 'AI receives the original input rather than a dictionary guess');
  assert.equal(output.textContent,'tán muón M10');
  requests[2].resolve({ok:true,json:async()=>({candidates:[{model:'bartpho',text:'tán muốn M10'}],elapsedMs:50})});
  await flush(); assert.equal(output.textContent,'tán muốn M10');
  ai.checked=false; ai.events.change(); await advance(1000);
  assert.equal(output.textContent,'tán muón M10'); assert.equal(requests.length,3);
  ai.checked=true; ai.events.change(); await advance(1000);
  requests[3].resolve({ok:false,status:422,json:async()=>({error:'Chưa có model BARTpho'})});
  await flush(); assert.equal(output.textContent,'tán muón M10');
  assert.match(nodes.get('#spell-status').textContent,/Chưa có model BARTpho/);
  await type('muón M10'); await advance(1000);
  const engine = nodes.get('#spell-engine');
  engine.value='qwen3'; engine.events.change(); await advance(1000);
  assert.ok(requests[4].options.signal.aborted);
  assert.equal(JSON.parse(requests[5].options.body).engine,'qwen3');
  assert.match(nodes.get('#spell-engine-help').textContent,/Ollama/);
  requests[4].resolve({ok:true,json:async()=>({candidates:[{model:'bartpho',text:'muốn M10'}],elapsedMs:10})});
  await flush(); assert.equal(output.textContent,'muón M10');
  requests[5].resolve({ok:true,json:async()=>({candidates:[{model:'qwen3:1.7b',text:'muốn M10'}],elapsedMs:50})});
  await flush(); assert.equal(output.textContent,'muốn M10');
  assert.equal(nodes.get('#spell-status').textContent,'');
  const suggestionList = nodes.get('#spell-suggestions');
  input.value='bugf lloong M10'; input.events.input();
  await advance(299);
  assert.equal(suggestionList.children.length,0,'suggestions wait until typing pauses');
  await advance(1);
  const button = suggestionList.children.find(child=>child.type==='button');
  assert.equal(suggestionList.children[0].textContent,'Gợi ý');
  assert.equal(button.textContent,'bu lông');
  assert.equal(requests.length,6,'suggestions appear before the AI request');
  await advance(1000);
  button.events.click();
  assert.equal(output.textContent,'bu lông M10');
  assert.equal(input.value,'bugf lloong M10');
  assert.ok(requests[6].options.signal.aborted);
  requests[6].resolve({ok:true,json:async()=>({candidates:[{text:'bugf lloong M10'}],elapsedMs:10})});
  await flush(); assert.equal(output.textContent,'bu lông M10');
  await nodes.get('#spell-copy').events.click(); assert.equal(copied,'bu lông M10');
  engine.value='vn-base';
  await type('muón M10'); await advance(1000);
  assert.equal(JSON.parse(requests[7].options.body).engine,'vn-base');
  requests[7].resolve({ok:true,json:async()=>({candidates:[{model:'vn-base',text:'muốn M10'}],elapsedMs:100})});
  await flush(); assert.equal(output.textContent,'muốn M10');
  assert.equal(nodes.get('#spell-status').textContent,'');
  engine.value='bartpho-protonx'; engine.events.change(); await advance(1000);
  assert.equal(JSON.parse(requests[8].options.body).engine,'bartpho-protonx');
  requests[8].resolve({ok:true,json:async()=>({candidates:[{model:'bartpho',text:'muốn M12'},{model:'protonx',text:'muốn M10'}],elapsedMs:200})});
  await flush(); assert.equal(output.textContent,'muốn M10');
  assert.equal(nodes.get('#spell-status').textContent,'');
  assert.match(nodes.get('#spell-model-status').textContent,/Các model đã nạp sẵn/);
});
