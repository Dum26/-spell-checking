"use strict";
const fs = require('node:fs');
const path = require('node:path');
const {check,selectAiCorrection,setDictionary} = require('../spellcheck');
const {correctSpelling,stopSpellingAi} = require('../spelling-ai');
const {correctWithQwen} = require('../ollama-spelling');
setDictionary(require('../spelling-dictionary.json'));
const engine = process.argv[2] || 'vn-base';
if (!['vn-base','bartpho','bartpho-protonx','qwen3'].includes(engine)) throw new Error('Unknown benchmark engine');
const modelRevisions = {
  'vn-base':'nrl-ai/vn-spell-correction-base@ba1e57fc3bacdfb22bfa20b19db7182a6d1b0b6b',
  bartpho:'bmd1905/vietnamese-correction-v2@a3d342348d39d87622aa58aabd07de38ade8c17b',
  protonx:'protonx-models/protonx-legal-tc@2007b3f3e577dcbebf0e5c435bfe041584920cd1',
  qwen3:'qwen3:1.7b (Ollama tag)',
};
const cases = [
  ['bugf lloong',['bu lông','bulong']],
  ['bugf loong M10',['bu lông M10','bulong M10']],
  ['dunhg cui rut rivet',['dụng cụ rút rivet']],
  ['kim rut riveet 6201-2RS',['kìm rút rivet 6201-2RS']],
  ['vong bii 6201-2RS',['vòng bi 6201-2RS']],
  ['tôi muón mua M10',['tôi muốn mua M10']],
  ['toi muoomss mua dụng cu doa khoang cach',['tôi muốn mua dụng cụ đo khoảng cách']],
  ['tôi đnag cần mua vòng bi',['tôi đang cần mua vòng bi']],
  ['may khoagn cam tay',['máy khoan cầm tay']],
  ['ong khi nens',['ống khí nén']],
  ['tans khoas m10',['tán khóa m10','tán khoá m10']],
  ['bulonh M8x30',['bulong M8x30']],
  ['dụng cụ rút rivet',['dụng cụ rút rivet']],
  ['bu lông M10',['bu lông M10']],
  ['vòng bi 6201-2RS',['vòng bi 6201-2RS']],
  ['AirTac G1/4 SATA M10',['AirTac G1/4 SATA M10']],
  ['dao doa lỗ',['dao doa lỗ']],
  ['tôi muốn mua M10',['tôi muốn mua M10']],
  ['dụng cụ dò khoảng cách',['dụng cụ dò khoảng cách']],
  ['bu lông M10\r\nvòng bi 6201-2RS',['bu lông M10\r\nvòng bi 6201-2RS']],
];
(async()=>{
  const results = [];
  try {
    for (const [input,expected] of cases) {
      const dictionary = check(input);
      const response = engine === 'qwen3' ? await correctWithQwen(input) : await correctSpelling(input,engine);
      const raw = response.candidates[0]?.text;
      const selected = dictionary.unknown.length ? selectAiCorrection(input,response.candidates) : {text:dictionary.text,applied:false};
      const row = {input,expected,dictionary:dictionary.text,model:raw,candidates:response.candidates,combined:selected.text,applied:selected.applied,elapsedMs:response.elapsedMs,
        dictionaryPass:expected.includes(dictionary.text),modelPass:expected.includes(raw),combinedPass:expected.includes(selected.text)};
      results.push(row);
      console.log(JSON.stringify(row));
    }
    const report = {engine,models:(engine==='bartpho-protonx' ? ['bartpho','protonx'] : [engine]).map(name=>modelRevisions[name]),device:engine==='qwen3' ? 'Ollama' : 'CPU INT8',cases:results.length,
      dictionaryPass:results.filter(row=>row.dictionaryPass).length,modelPass:results.filter(row=>row.modelPass).length,combinedPass:results.filter(row=>row.combinedPass).length,results};
    const destination = path.resolve(__dirname,`../output/spelling/${engine}-trial.json`);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({report:destination,dictionaryPass:report.dictionaryPass,modelPass:report.modelPass,combinedPass:report.combinedPass,total:report.cases}));
  } finally { stopSpellingAi(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
