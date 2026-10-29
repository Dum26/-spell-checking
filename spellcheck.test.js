"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { check, apply } = require("./spellcheck");

test("Telex and known typos are corrected without changing technical tokens or spacing", () => {
  assert.equal(check('tans khoas m10\r\nbulonh\tM8x30 inox 304, 6201-2RS, SC50x35 AirTac G1/4').text,
    'tán khoá m10\r\nbulong\tM8x30 inox 304, 6201-2RS, SC50x35 AirTac G1/4');
  assert.equal(check('Tans Khoas M10 BULONH SATA Bosi').text, 'Tán Khoá M10 BULONH SATA Bosi');
  assert.equal(check('bu lonh M8x30').text, 'bulong M8x30');
  assert.notEqual(check('bu\nlonh').text, 'bulong');
});
test("accented text, unknown words and markup are preserved", () => {
  for (const input of ['Kìm Mở Phe Mũi Thẳng', 'tôi muốn sửa chính tả', 'từ\u0300', '<img src=x onerror=alert(1)>', 'zzzzzz QWERTY']) {
    assert.equal(check(input).text, input);
  }
});
test("ambiguous words wait for context while a unique typo is corrected", () => {
  const result = check('ban m10, ban M12; bulogn');
  assert.equal(result.text, 'ban m10, ban M12; bulong');
  assert.deepEqual(result.unknown, ['ban','ban']);
  assert.equal(result.changes.length, 1);
  assert.equal(apply(result.source, result.changes), result.text);
});
test("empty input and size boundaries", () => {
  assert.equal(check('').text, '');
  assert.equal(check('1'.repeat(10000)).text.length, 10000);
  assert.throws(() => check('a'.repeat(10001)), RangeError);
});

test("chinhta phrases take priority, preserve correct terms, technical tokens and line boundaries", () => {
  const { setDictionary } = require('./spellcheck');
  const data = require('./spelling-dictionary.json');
  setDictionary(data);
  for (const name of ['Copy of Keyword_Chinhta_tan.xlsx','Tacke.xlsx']) assert.ok(data.sources.some(source => source.file === name && source.usedRows > 0), name);
  assert.equal(check('ee cu canhs chuoonf M10').text, 'tán cánh chuồn M10');
  assert.equal(check('tawcs kee nhuwaj gai 6 khias M8x30').text, 'tắc kê nhựa gai 6 khía M8x30');
  assert.equal(check('tacws kee ddanj 6201-2RS').text, 'tắc kê đạn 6201-2RS');
  assert.equal(check('tắc kê nở ba cánh M10').text, 'tắc kê nở 3 cánh M10');
  assert.equal(check('tắc kê nhựa gai sáu khía 6201-2RS').text, 'tắc kê nhựa gai 6 khía 6201-2RS');
  assert.equal(check('tôi muốn sửa chính tả').text, 'tôi muốn sửa chính tả');
  assert.equal(check('Tôi muốn mua dụng cụ đo khoảng cách M10').text, 'Tôi muốn mua dụng cụ đo khoảng cách M10');
  const userExample = 'toi muoomss mua dụng cu doa khoang cach';
  assert.equal(check(userExample).text, 'toi muoomss mua dụng cụ đo khoảng cách');
  assert.deepEqual(check(userExample).unknown, ['toi','muoomss']);
  assert.equal(check('dụng cu do khoang cach').text, 'dụng cụ đo khoảng cách');
  assert.equal(check('tu dun').text, 'tu dun');
  const {selectAiCorrection} = require('./spellcheck');
  assert.equal(selectAiCorrection(userExample, [
    {model:'bartpho',text:'Tôi muốn sớm mua dụng cu doa khoang cach'},
  ]).text, check(userExample).text);
  assert.equal(selectAiCorrection('tôi muón mua dụng cụ đo khoảng cách M10', [
    {model:'bartpho',text:'Tôi muốn mua dụng cụ đo khoảng cách M10'},
  ]).text, 'Tôi muốn mua dụng cụ đo khoảng cách M10');
  assert.equal(check('bang keo m10; may cat M8x30 inox 304; bo loc khi 6201-2RS').text,
    'băng keo m10; máy cắt M8x30 inox 304; bộ lọc khí 6201-2RS');
  assert.equal(check('ban chai ve sinh\nđông cơ điên\nxe day hang').text,
    'bàn chải vệ sinh\nđộng cơ điện\nxe đẩy hàng');
  assert.equal(check('banchai\nBawng Keo\nbang\t  keo').text, 'bàn chải\nBăng Keo\nbăng\t  keo');
  assert.equal(check('tans khoas m10 bulonh').text, 'tán khóa m10 bulong');
  assert.equal(check('cao 2cang m10').text, 'cảo 2 càng m10');
  const explicit = new Map((data.overrides || []).map(([wrong, id]) => [wrong, data.terms[id]]));
  for (const term of data.terms) assert.equal(check(term).text, explicit.get(term) || term, term);
  assert.equal(check('buulong luc giac m10 ma kem').text, 'bulong lục giác m10 mạ kẽm');
  assert.equal(check('boulon M8x30 inix').text, 'bulong M8x30 inox');
  assert.equal(check('long den phang thep ma kem M12').text, 'lông đền phẳng thép mạ kẽm M12');
  assert.equal(check('bac dan 6201-2RS').text, 'vòng bi 6201-2RS');
  assert.equal(check('Bosy Bóch').text, 'Bosi Bosch');
  assert.equal(check("dungj cuj ddo khoang cach' M10").text, "dụng cụ đo khoảng cách' M10");
  assert.equal(check('dungj cuj đo khoảng cách 6201-2RS').text, 'dụng cụ đo khoảng cách 6201-2RS');
  assert.equal(check('dụng cụ ddo khoang cach').text, 'dụng cụ đo khoảng cách');
  assert.equal(check('kt 421 25').text, 'kt 421 25');
  assert.equal(check('AirTac G1/4 SATA M10 0.6-2.6 7.5"').text, 'AirTac G1/4 SATA M10 0.6-2.6 7.5"');
  // Phrase matching must never combine two separate input rows.
  setDictionary({terms:['cụm kiểm thử'], variants:[['foo bar', 0]]});
  assert.notEqual(check('foo\nbar').text, 'cụm kiểm thử');
  assert.equal(check('foo bar').text, 'cụm kiểm thử');
  setDictionary({terms:['bulong m12'], variants:[['bulonh m10', 0]]});
  assert.equal(check('bulonh m10').text, 'bulonh m10');
  setDictionary({terms:['tắc kê nở 6 cánh'], variants:[], overrides:[['tắc kê nở ba cánh',0],['tắc kê nở 3 cánh',0]]});
  assert.equal(check('tắc kê nở ba cánh').text, 'tắc kê nở ba cánh');
  assert.equal(check('tắc kê nở 3 cánh').text, 'tắc kê nở 3 cánh');
  assert.throws(() => setDictionary({terms:[], variants:[['foo', 7]]}));
});

test('context matching refuses competing phrases and preserves supplied accents', () => {
  const {setDictionary} = require('./spellcheck');
  setDictionary({terms:['dụng cụ đo khoảng cách','dụng cụ dò khoảng cách','dao doa lỗ'],variants:[]});
  assert.ok(!check('dung cu doa khoang cach').changes.some(change => change.after.includes('khoảng cách')));
  assert.equal(check('dao doa lỗ').text,'dao doa lỗ');
  assert.equal(check('dụng cụ dò khoảng cách').text,'dụng cụ dò khoảng cách');
});

test('fuzzy catalog matching handles multiple typos and offers uncertain short phrases without guessing', () => {
  const {setDictionary} = require('./spellcheck');
  setDictionary(require('./spelling-dictionary.json'));
  assert.equal(check('dunhg cui rut rivet M10').text,'dụng cụ rút rivet M10');
  assert.equal(check('dunhg cui rut rivet; dunhg cui rut rivet').text,'dụng cụ rút rivet; dụng cụ rút rivet');
  assert.equal(check('kim rut riveet 6201-2RS').text,'kìm rút rivet 6201-2RS');
  const result = check('bugf lloong M10');
  const suggestion = result.suggestions.find(item=>item.text==='bu lông');
  assert.ok(suggestion);
  assert.equal(apply(result.source,[{...suggestion,after:suggestion.text}]),'bu lông M10');
  assert.notEqual(result.text,'bu lông M10','severe short typos require the user to choose');
  const repeated = check('bugf lloong; bugf lloong');
  assert.ok(repeated.suggestions.some(item=>item.start===13 && item.end===24 && item.text==='bu lông'));
  for (const input of ['AirTac G1/4 SATA M10','zzzzzz qwerty', 'bugf\nlloong', 'bugf, lloong']) {
    assert.equal(check(input).suggestions.length,0,input);
  }
  assert.ok(check('vong bii M12').suggestions.some(item=>item.text==='vòng bi'));
  assert.equal(check('a'.repeat(4999)+' '+'a'.repeat(5000)).suggestions.length,0);
  setDictionary({terms:['dụng cụ đo khoảng cách','dụng cụ dò khoảng cách'],variants:[]});
  const ambiguous = check('dunhg cui do khoang cach');
  assert.ok(!ambiguous.changes.some(change=>change.after.includes('khoảng cách')));
  assert.equal(ambiguous.suggestions.length,2);
  assert.equal(check('dụng cụ dò khoảng cách').text,'dụng cụ dò khoảng cách');
});
