"use strict";
const {test} = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const {safeAiCorrection, selectAiCorrection, setDictionary} = require('./spellcheck');

test('AI accepts spelling fixes but rejects changed codes, punctuation and unsupported guesses', () => {
  setDictionary({terms:['muốn', 'dụng cụ'], variants:[]});
  const source = 'tôi muón mua M10 6201-2RS AirTac';
  const good = 'tôi muốn mua M10 6201-2RS AirTac';
  assert.ok(safeAiCorrection(source, good));
  for (const bad of [good.replace('M10','M12'), good.replace('6201-2RS','6201'), good.replace('AirTac','Airtac'), good + '?', 'mua M10']) {
    assert.equal(safeAiCorrection(source, bad), false);
  }
  assert.equal(safeAiCorrection('tôi muón\nmua', 'tôi muốn mua'), false);
  assert.equal(safeAiCorrection('tôi muoomss mua', 'tôi muốn sớm mua'), false);
  assert.equal(selectAiCorrection(source, [{model:'bartpho',text:good}]).text, good);
  assert.equal(selectAiCorrection('zzzz', [{text:'xxxx'}]).text, 'zzzz');
  assert.equal(selectAiCorrection('muón M10', [{text:'muốn M12'}]).text, 'muón M10');
});

test('AI worker reuses models, handles split UTF-8 output and rejects concurrent requests', async t => {
  const workers = [];
  t.mock.method(cp, 'spawn', command => {
    const child = new EventEmitter();
    if (command === 'taskkill') return child;
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; child.emit('exit', 0); };
    workers.push(child);
    queueMicrotask(() => child.stdout.write('{"ready":true,"pid":123456}\n'));
    return child;
  });
  delete require.cache[require.resolve('./spelling-ai')];
  const {correctSpelling, warmSpellingAi, stopSpellingAi} = require('./spelling-ai');
  t.after(stopSpellingAi);
  const warmup = warmSpellingAi();
  assert.deepEqual(JSON.parse(workers[0].stdin.read().toString()),{warmup:true});
  await assert.rejects(correctSpelling('test'),{statusCode:503});
  workers[0].stdout.write('{"models":{"vn-base":"ready","bartpho":"ready","protonx":"ready"},"errors":{}}\n');
  assert.equal((await warmup).models.protonx,'ready');
  const first = correctSpelling('muón');
  assert.equal(JSON.parse(workers[0].stdin.read().toString()).engine,'bartpho');
  await assert.rejects(correctSpelling('another'), {statusCode:503});
  const bytes = Buffer.from(JSON.stringify({candidates:[{model:'bartpho',text:'muốn'}],elapsedMs:12})+'\n');
  const split = bytes.indexOf(Buffer.from('ố')) + 1;
  workers[0].stdout.write(bytes.subarray(0,split)); workers[0].stdout.write(bytes.subarray(split));
  assert.equal((await first).candidates[0].text, 'muốn');
  const second = correctSpelling('tôi','vn-base');
  assert.deepEqual(JSON.parse(workers[0].stdin.read().toString()),{text:'tôi',engine:'vn-base'});
  workers[0].stdout.write('{"candidates":[],"elapsedMs":1}\n');
  await second;
  const combined = correctSpelling('muón','bartpho-protonx');
  assert.equal(JSON.parse(workers[0].stdin.read().toString()).engine,'bartpho-protonx');
  workers[0].stdout.write('{"candidates":[{"model":"bartpho","text":"muốn"},{"model":"protonx","text":"muộn"}],"elapsedMs":2}\n');
  assert.equal((await combined).candidates.length,2);
  assert.equal(workers.length, 1);
  await assert.rejects(correctSpelling('test','unknown'),{statusCode:400});
  const failed = correctSpelling('test');
  workers[0].emit('exit',1);
  await assert.rejects(failed, /AI đã dừng/);
  assert.ok(workers[0].killed);
});

test('combined models reject unsafe candidates and abstain on equally supported conflicting corrections', () => {
  setDictionary({terms:['muốn','muộn'],variants:[]});
  const source = 'tôi muón M10';
  assert.equal(selectAiCorrection(source,[{text:'tôi muốn M12'},{text:'tôi muốn M10'}]).text,'tôi muốn M10');
  assert.equal(selectAiCorrection(source,[{text:'Tôi muốn M10'},{text:'tôi muốn M10'}]).text,'tôi muốn M10');
  assert.equal(selectAiCorrection('Tôi muón M10',[{text:'tôi muốn M10'},{text:'Tôi muốn M10'}]).text,'Tôi muốn M10');
  assert.equal(selectAiCorrection(source,[{text:'tôi muốn M10'},{text:'tôi muộn M10'}]).applied,false);
  assert.equal(selectAiCorrection(source,[{text:source},{text:'tôi muốn M10'}]).applied,true);
});
