"use strict";
(() => {
  // Fallback vocabulary; explicit phrase mappings from chinhta.xlsx take priority.
  const words = `tôi bạn mình chúng ta đang đã sẽ cần muốn mua bán có không và hoặc của cho với tại là được dùng gõ sửa chữ văn bản chính tả tiếng Việt
    tán khoá khóa bu lông bulong ốc vít đai ốc vòng đệm long đền ê cu cờ lê mỏ lết kìm mở phe mũi cong thẳng tuốt dây cách điện tự động
    bạc đạn vòng bi mắt trâu nhôm định hình dài rộng dày tiết lưu ống ren inox thép đồng nhựa cao su xy lanh khí nén dây đai dẹt
    dầu mỡ bơm van khớp nối đầu cút nút bịt bánh răng trục động cơ máy khoan cắt hàn đá nhám lưỡi cưa gỗ răng mặt bích lò xo
    trong ngoài trái phải trên dưới chiều kích thước số lượng sản phẩm hàng đơn giá bộ cái chiếc hộp túi mét milimét`.split(/\s+/u);
  const aliases = new Map([["bulonh", "bulong"], ["buloong", "bulong"], ["bulong", "bulong"], ["khoas", "khoá"]]);
  const fold = value => value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gu, "d").toLowerCase();
  function telex(value) {
    let tone = "";
    const tones = {"\u0301":"s", "\u0300":"f", "\u0309":"r", "\u0303":"x", "\u0323":"j"};
    return value.toLowerCase().normalize("NFD").replace(/[\u0301\u0300\u0309\u0303\u0323]/gu, mark => { tone = tones[mark]; return ""; })
      .replace(/a\u0306/gu, "aw").replace(/([aeo])\u0302/gu, "$1$1").replace(/([ou])\u031b/gu, "$1w").replace(/đ/gu, "dd") + tone;
  }
  const vocabulary = new Set(words.map(word => word.toLowerCase()));
  const keys = new Map();
  for (const word of vocabulary) for (const key of [fold(word), telex(word)]) {
    if (!keys.has(key)) keys.set(key, new Set());
    keys.get(key).add(word);
  }
  const tokenPattern = /[\p{L}\p{M}\p{N}]+(?:[._/×x-][\p{L}\p{M}\p{N}]+)*/gu;
  const numberWords = new Map(Object.entries({không:'0',một:'1',hai:'2',ba:'3',bốn:'4',năm:'5',sáu:'6',bảy:'7',tám:'8',chín:'9',mười:'10'}));
  function numberSignature(text, explicit) {
    const expanded = explicit ? text.replace(tokenPattern, word => numberWords.get(word.toLowerCase()) || word) : text;
    return (expanded.match(/\d+(?:[.,]\d+)*/gu) || []).join('\0');
  }
  const normalizePhrase = text => text.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
  let phrases = new Map(), phraseLengths = new Map(), wordCorrections = new Map(), dictionaryWords = new Set(), contextPhrases = new Map(), overrides = new Set();
  let fuzzyPhrases = new Map();
  const deletionKeys = word => [...new Set([word, ...Array.from(word, (_, i) => word.slice(0,i) + word.slice(i+1))])];
  function setDictionary(data) {
    if (!Array.isArray(data.terms) || !Array.isArray(data.variants)) throw new Error("Từ điển không hợp lệ.");
    const nextPhrases = new Map(), lengths = new Map();
    for (const [wrong, id] of data.variants) {
      if (typeof wrong !== "string" || !Number.isInteger(id) || typeof data.terms[id] !== "string") throw new Error("Từ điển không hợp lệ.");
      nextPhrases.set(normalizePhrase(wrong), normalizePhrase(data.terms[id]));
    }
    for (const term of data.terms) nextPhrases.set(normalizePhrase(term), normalizePhrase(term));
    // Explicit database normalization (e.g. "bạc đạn" → "vòng bi") overrides ordinary terms.
    for (const [wrong, id] of data.overrides || []) {
      if (typeof wrong !== "string" || !Number.isInteger(id) || typeof data.terms[id] !== "string") throw new Error("Quy tắc chuẩn hóa không hợp lệ.");
      nextPhrases.set(normalizePhrase(wrong), normalizePhrase(data.terms[id]));
    }
    for (const phrase of nextPhrases.keys()) {
      const tokens = [...phrase.matchAll(tokenPattern)];
      if (!tokens.length) continue;
      const first = tokens[0][0];
      if (!lengths.has(first)) lengths.set(first, new Set());
      lengths.get(first).add(tokens.length);
    }
    phrases = nextPhrases;
    wordCorrections = new Map(data.wordVariants || []);
    dictionaryWords = new Set(data.terms.flatMap(term => [...term.matchAll(tokenPattern)].map(token => token[0].toLowerCase())));
    overrides = new Set((data.overrides || []).map(([wrong]) => normalizePhrase(wrong)));
    contextPhrases = new Map();
    fuzzyPhrases = new Map();
    for (const term of data.terms) {
      const parts = normalizePhrase(term).split(' ');
      if (parts.length >= 2 && parts.length <= 8 && parts.every(part => /^[\p{L}\p{M}]+$/u.test(part))) {
        const entry = {text:phrases.get(normalizePhrase(term)), parts, forms:parts.map(part => [...new Set([fold(part),telex(part)])])};
        for (const form of entry.forms.at(-1)) for (const key of deletionKeys(form)) {
          const anchor = parts.length + ':' + key;
          if (!fuzzyPhrases.has(anchor)) fuzzyPhrases.set(anchor, new Set());
          fuzzyPhrases.get(anchor).add(entry);
        }
      }
      if (parts.length < 3 || parts.length > 8 || parts.some(protectedToken)) continue;
      const anchor = fold(parts.slice(0,2).join(' '));
      if (!contextPhrases.has(anchor)) contextPhrases.set(anchor, []);
      contextPhrases.get(anchor).push({text:normalizePhrase(term), folded:fold(term), length:parts.length});
    }
    phraseLengths = new Map([...lengths].map(([first, values]) => [first, [...values].sort((a, b) => b - a)]));
  }
  function protectedToken(word) {
    return /\p{N}/u.test(word) || /^[A-Z]{2,}$/u.test(word) || /[A-Z]/u.test(word.slice(1));
  }
  function phraseProtectedToken(word) {
    // Explicit Excel mappings may split "2cang" into "2 càng", but never rewrite M10 or 6201-2RS.
    return protectedToken(word) && !/^\d+[\p{L}\p{M}]*$/u.test(word);
  }
  function phraseCase(original, target) {
    const originalWords = original.match(/\S+/gu) || [], targetWords = target.split(" ");
    if (originalWords.length === targetWords.length) {
      let index = 0;
      return original.replace(/\S+/gu, word => matchCase(word, targetWords[index++]));
    }
    return matchCase(original, target);
  }
  function matchCase(source, target) {
    return source[0] === source[0].toUpperCase() ? target[0].toUpperCase() + target.slice(1) : target;
  }
  function oneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    if (a.length > b.length) return oneEdit(b, a);
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
      || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return a.slice(i) === b.slice(i + 1);
  }
  function keepsAccents(before, after) {
    const left = before.match(tokenPattern) || [], right = after.match(tokenPattern) || [];
    return left.length === right.length && left.every((word,index) => word === fold(word) || word === right[index]);
  }
  function editDistance(a, b) {
    if (Math.abs(a.length-b.length) > 2) return 3;
    const rows = [Array.from({length:b.length+1},(_,i)=>i)];
    for (let i=1;i<=a.length;i++) {
      const row = [i];
      for (let j=1;j<=b.length;j++) {
        row[j] = Math.min(rows[i-1][j]+1,row[j-1]+1,rows[i-1][j-1]+(a[i-1] === b[j-1] ? 0 : 1));
        if (i>1 && j>1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) row[j] = Math.min(row[j],rows[i-2][j-2]+1);
      }
      rows.push(row);
    }
    return rows[a.length][b.length];
  }
  function fuzzyMatches(source, tokens, index, cache) {
    const matches = [];
    for (let length=Math.min(8,tokens.length-index);length>=2;length--) {
      const window = tokens.slice(index,index+length), last = window.at(-1);
      const before = source.slice(window[0].index,last.index+last[0].length);
      if (!/^[\p{L}\p{M} \t]+$/u.test(before) || window.some(token => token[0].length>40 || protectedToken(token[0])) || phrases.has(normalizePhrase(before))) continue;
      const cached = cache.get(before);
      if (cached) {
        matches.push(...cached.map(match=>({...match,start:window[0].index,end:last.index+last[0].length})));
        continue;
      }
      const windowMatches = [];
      const input = window.map(token => token[0].normalize('NFC').toLowerCase());
      const tail = fold(wordCorrections.get(input.at(-1)) || input.at(-1));
      const candidates = new Set(deletionKeys(tail).flatMap(key => [...(fuzzyPhrases.get(length+':'+key) || [])]));
      for (const candidate of candidates) {
        if (!keepsAccents(before.toLowerCase(),candidate.parts.join(' '))) continue;
        let distance = 0, unchanged = 0;
        for (let i=0;i<length;i++) {
          const word = fold(wordCorrections.get(input[i]) || input[i]);
          const cost = Math.min(...candidate.forms[i].map(form=>editDistance(word,form)));
          distance += cost;
          if (!cost) unchanged++;
          if (cost>2 || distance>3) { distance=4; break; }
        }
        if (distance>0 && distance<=3) windowMatches.push({text:candidate.text,length,distance,unchanged});
      }
      cache.set(before,windowMatches);
      matches.push(...windowMatches.map(match=>({...match,start:window[0].index,end:last.index+last[0].length})));
    }
    // Keep accent alternatives distinct so ambiguous phrases cannot auto-correct.
    matches.sort((a,b)=>b.length-a.length || a.distance-b.distance || a.text.localeCompare(b.text));
    const unique = new Map();
    for (const match of matches) {
      const key = match.length + ':' + match.text;
      if (!unique.has(key)) unique.set(key,match);
    }
    return [...unique.values()];
  }
  function contextualMatch(source, tokens, index) {
    if (!tokens[index+2]) return;
    const anchor = tokens.slice(index,index+2).map(token => fold(wordCorrections.get(token[0].toLowerCase()) || token[0])).join(' ');
    const matches = [];
    for (const candidate of contextPhrases.get(anchor) || []) {
      const last = tokens[index+candidate.length-1];
      if (!last) continue;
      const before = normalizePhrase(source.slice(tokens[index].index,last.index+last[0].length));
      if (!/^[\p{L}\p{M} ]+$/u.test(before) || phrases.has(before) || !keepsAccents(before,candidate.text)) continue;
      const folded = before.replace(tokenPattern, word => fold(wordCorrections.get(word) || word));
      if (folded !== candidate.folded && oneEdit(folded,candidate.folded)) matches.push(candidate);
    }
    if (!matches.length) return;
    const longest = Math.max(...matches.map(candidate => candidate.length));
    const best = matches.filter(candidate => candidate.length === longest);
    return new Set(best.map(candidate => candidate.text)).size === 1 ? best[0] : undefined;
  }
  function check(source) {
    if (source.length > 10000) throw new RangeError("Văn bản tối đa 10.000 ký tự.");
    const changes = [], unknown = [], suggestions = [];
    const fuzzyCache = new Map();
    const tokens = [...source.matchAll(tokenPattern)];
    const wholePhrase = normalizePhrase(source);
    if (tokens.length > 1 && !/[\r\n]/u.test(source) && phrases.get(wholePhrase) === wholePhrase) return {source,changes,unknown,suggestions,text:source};
    for (let index = 0; index < tokens.length; index++) {
      const match = tokens[index];
      const original = match[0], lower = original.toLowerCase().normalize("NFC");
      let matched = false;
      const foldedFirst = fold(wordCorrections.get(lower) || lower);
      const fuzzy = fuzzyMatches(source,tokens,index,fuzzyCache);
      const best = fuzzy[0], runnerUp = fuzzy[1];
      if (best && best.length>=3 && best.distance<=2 && best.unchanged>=1
        && (!runnerUp || runnerUp.length<best.length || runnerUp.distance>=best.distance+2)) {
        const before = source.slice(best.start,best.end), after = phraseCase(before,best.text);
        changes.push({start:best.start,end:best.end,before,after});
        index += best.length-1;
        continue;
      }
      for (const suggestion of fuzzy.filter(item=>item.length===best?.length && item.distance<=best.distance+1).slice(0,3)) {
        if (suggestions.length<6) suggestions.push({...suggestion,text:phraseCase(source.slice(suggestion.start,suggestion.end),suggestion.text)});
      }
      const contextual = contextualMatch(source,tokens,index);
      const next = tokens[index+1];
      const between = next ? source.slice(match.index+original.length,next.index) : '';
      const splitAlias = /^[ \t]+$/u.test(between) ? aliases.get(lower + next[0].toLowerCase()) : undefined;
      const lengths = [...new Set([...(phraseLengths.get(lower) || []), ...(phraseLengths.get(foldedFirst) || []), ...(contextual ? [contextual.length] : []), ...(splitAlias ? [2] : [])])].sort((a, b) => b - a);
      for (const length of lengths) {
        const last = tokens[index + length - 1];
        if (!last) continue;
        const end = last.index + last[0].length, before = source.slice(match.index, end);
        if (/[\r\n]/u.test(before)) continue;
        const normalized = normalizePhrase(before);
        const mixedKey = normalized.replace(tokenPattern, word => fold(wordCorrections.get(word) || word));
        const mixed = phrases.get(mixedKey);
        const encoded = normalized.replace(tokenPattern, word => wordCorrections.get(word) || word);
        // Mixed Telex may be folded only when supplied accents remain unchanged.
        const mixedLookup = mixed !== undefined && (normalized === fold(normalized) || keepsAccents(encoded,mixed));
        const correct = phrases.get(normalized) ?? (mixedLookup ? mixed : undefined) ?? (contextual?.length === length ? contextual.text : undefined) ?? (length === 2 ? splitAlias : undefined);
        if (correct === undefined) continue;
        if (length === 1 && /^[a-z]+$/u.test(lower) && !overrides.has(lower) && !aliases.has(lower)
          && (lower.length <= 3 || (keys.get(lower)?.size || 0) > 1) && (keys.has(lower) || lower !== correct) && fold(correct) === lower) {
          unknown.push(original); matched = true; break;
        }
        const protectedBefore = tokens.slice(index, index + length).map(token => token[0]).filter(phraseProtectedToken);
        const protectedAfter = [...correct.matchAll(tokenPattern)].map(token => token[0]).filter(phraseProtectedToken);
        const numericOverride = overrides.has(normalized) && numberSignature(before, false) !== numberSignature(correct, false);
        if (protectedBefore.join("\0") !== protectedAfter.join("\0")
          || numberSignature(before, numericOverride) !== numberSignature(correct, numericOverride)) {
          index += length - 1;
          matched = true;
          break;
        }
        const after = normalizePhrase(before) === correct ? before : phraseCase(before, correct);
        if (after !== before) changes.push({start:match.index, end, before, after});
        index += length - 1;
        matched = true;
        break;
      }
      if (matched) continue;
      // Numbers, mixed-case brands, acronyms and already accented words stay untouched.
      if (protectedToken(original) || vocabulary.has(lower) || dictionaryWords.has(lower)) continue;
      if (!/^[a-z]+$/iu.test(original)) { unknown.push(original); continue; }
      let candidates = aliases.has(lower) ? [aliases.get(lower)] : wordCorrections.has(lower) ? [wordCorrections.get(lower)] : [...(keys.get(lower) || [])];
      if (!candidates.length && lower.length >= 4 && original === lower) {
        candidates = [...new Set([...keys].filter(([key]) => oneEdit(lower, key)).flatMap(([, values]) => [...values]))];
      }
      const range = {start:match.index, end:match.index + original.length, before:original};
      candidates = [...new Set(candidates)];
      if (candidates.length === 1) {
        const after = matchCase(original, candidates[0]);
        if (after !== original) changes.push({...range, after});
      } else unknown.push(original);
    }
    return {source, changes, unknown, suggestions, text:apply(source, changes)};
  }
  function apply(source, changes) {
    let text = source;
    for (const change of [...changes].sort((a, b) => b.start - a.start)) text = text.slice(0, change.start) + change.after + text.slice(change.end);
    return text;
  }
  function safeAiCorrection(source, candidate) {
    if (typeof candidate !== 'string' || !candidate.trim() || candidate.length > source.length * 1.5 + 12 || candidate.length < source.length * 0.6) return false;
    const protectedParts = text => [...text.matchAll(tokenPattern)].map(token => token[0]).filter(protectedToken).join('\0');
    if (protectedParts(source) !== protectedParts(candidate)) return false;
    const punctuation = text => (text.match(/[^\p{L}\p{M}\p{N}\s]/gu) || []).join('');
    if (punctuation(source) !== punctuation(candidate)) return false;
    if ((source.match(/\r\n|\r|\n/gu) || []).join('') !== (candidate.match(/\r\n|\r|\n/gu) || []).join('')) return false;
    return [...source.matchAll(tokenPattern)].length === [...candidate.matchAll(tokenPattern)].length;
  }
  function selectAiCorrection(baseText, candidates) {
    const base = check(baseText);
    const options = new Map();
    const startsUpper = text => { const letter = text.match(/\p{L}/u)?.[0]; return letter && letter === letter.toUpperCase(); };
    for (const candidate of candidates) {
      if (!candidate || !safeAiCorrection(baseText, candidate.text)) continue;
      const corrected = check(candidate.text);
      if (safeAiCorrection(baseText, corrected.text) && corrected.unknown.length < base.unknown.length) {
        const key = corrected.text.normalize('NFC').toLowerCase();
        const previous = options.get(key);
        if (!previous || (startsUpper(corrected.text) === startsUpper(baseText) && startsUpper(previous.text) !== startsUpper(baseText))) options.set(key,corrected);
      }
    }
    const ranked = [...options.values()].sort((a,b)=>a.unknown.length-b.unknown.length);
    if (ranked.length && (!ranked[1] || ranked[0].unknown.length<ranked[1].unknown.length)) return {text:ranked[0].text, applied:true};
    return {text:base.text, applied:false};
  }
  if (typeof module !== "undefined" && module.exports) module.exports = {check, apply, setDictionary, safeAiCorrection, selectAiCorrection};
  if (typeof document === "undefined") return;
  const input = document.querySelector("#spell-input");
  if (!input) return;
  const output = document.querySelector("#spell-output"), status = document.querySelector("#spell-status");
  const copy = document.querySelector("#spell-copy"), ai = document.querySelector("#spell-ai");
  const suggestionList = document.querySelector('#spell-suggestions');
  const engine = document.querySelector('#spell-engine'), engineHelp = document.querySelector('#spell-engine-help');
  const modelStatus = document.querySelector('#spell-model-status');
  const engineName = () => engine.value === 'bartpho-protonx' ? 'BARTpho + ProtonX' : engine.value === 'vn-base' ? 'VN Spell Correction Base' : engine.value === 'qwen3' ? 'Qwen3-1.7B (Ollama)' : 'BARTpho';
  let timer, aiTimer, controller, generation = 0, composing = false, result, dictionaryState = "loading";
  function cancelAi() { generation++; clearTimeout(aiTimer); controller?.abort(); controller = undefined; }
  function renderSuggestions() {
    suggestionList.replaceChildren();
    for (const suggestion of result.suggestions) {
      const changes = [...result.changes.filter(change=>change.end<=suggestion.start || change.start>=suggestion.end), {...suggestion,after:suggestion.text}];
      const text = apply(result.source,changes);
      if (text === result.text) continue;
      if (!suggestionList.childElementCount) {
        const label = document.createElement('p');
        label.textContent = 'Gợi ý';
        suggestionList.append(label);
      }
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'app-button'; button.textContent = suggestion.text;
      button.addEventListener('click',()=>{
        if (input.value !== result.source) { render(); return; }
        cancelAi();
        result.text = text;
        output.textContent = text;
        status.textContent = 'Đã áp dụng gợi ý từ database. Nội dung gốc được giữ nguyên.';
        suggestionList.replaceChildren();
      });
      suggestionList.append(button);
    }
  }
  async function enhance(version, base, started = performance.now()) {
    if (version !== generation) return;
    controller = new AbortController();
    const name = engineName();
    status.textContent = `Đang kiểm tra bằng ${name} tại máy…`;
    try {
      const response = await fetch('/api/spelling', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:base,engine:engine.value}), signal:controller.signal});
      const data = await response.json();
      if (version !== generation) return;
      if (response.status === 503 && performance.now() - started < 120000) {
        status.textContent = "AI đang hoàn tất lượt trước; sẽ kiểm tra văn bản mới khi sẵn sàng…";
        aiTimer = setTimeout(() => enhance(version, base, started), 2000); return;
      }
      if (!response.ok) throw new Error(data.error || 'Không chạy được AI.');
      if (!Array.isArray(data.candidates)) throw new Error('Kết quả AI không hợp lệ.');
      const selected = selectAiCorrection(base, data.candidates);
      result.text = selected.text;
      output.textContent = result.text;
      renderSuggestions();
      status.textContent = '';
    } catch (error) {
      if (version === generation && error.name !== 'AbortError') status.textContent = `${error.message} Đang giữ bản sửa từ điển.`;
    }
  }
  function render() {
    clearTimeout(timer);
    cancelAi();
    engineHelp.textContent = engine.value === 'bartpho-protonx' ? 'Hai model cùng sửa văn bản gốc, database chọn kết quả phù hợp. Chạy local bằng CPU.' : engine.value === 'vn-base' ? 'Model chuyên sửa chính tả tiếng Việt, kết hợp database và gợi ý tên hàng. Chạy local bằng CPU.' : engine.value === 'qwen3' ? 'Qwen3-1.7B chạy local qua Ollama.' : 'BARTpho chạy trực tiếp tại máy.';
    const started = performance.now();
    result = check(input.value);
    renderSuggestions();
    const milliseconds = Math.round(performance.now() - started);
    output.textContent = result.text || "Bản sửa sẽ hiện ở đây.";
    copy.disabled = !result.source;
    status.textContent = !result.source ? "Nhập văn bản để bắt đầu." : `${result.changes.length} chỗ sửa · ${milliseconds} ms. Từ chưa nhận diện được giữ nguyên.`;
    if (dictionaryState === "loading") status.textContent += " Đang nạp từ điển database…";
    if (dictionaryState === "failed") status.textContent += " Không nạp được từ điển database; đang dùng quy tắc cơ bản.";
    if (ai.checked && dictionaryState !== 'loading' && result.unknown.length) {
      if (result.text.length <= 2000 && result.text.split(/\r\n|\r|\n/u).length <= 12) {
        const version = generation, base = result.source;
        aiTimer = setTimeout(() => enhance(version, base), 1000);
        status.textContent += ` Sẽ kiểm tra thêm bằng ${engineName()}…`;
      } else status.textContent += ' Phần AI chỉ nhận tối đa 2.000 ký tự và 12 dòng.';
    }
  }
  input.addEventListener("input", () => { cancelAi(); clearTimeout(timer); if (!composing) timer = setTimeout(render, 300); });
  input.addEventListener("compositionstart", () => { cancelAi(); composing = true; clearTimeout(timer); });
  input.addEventListener("compositionend", () => { composing = false; clearTimeout(timer); timer = setTimeout(render, 300); });
  ai.addEventListener('change', render);
  engine.addEventListener('change', render);
  copy.addEventListener("click", async () => {
    clearTimeout(timer);
    if (dictionaryState === "loading") { await dictionaryLoaded; render(); }
    if (input.value !== result.source) render();
    try { await navigator.clipboard.writeText(result.text); status.textContent = "Đã sao chép bản sửa."; }
    catch { status.textContent = "Không sao chép được. Bạn có thể chọn và sao chép văn bản bên cạnh."; }
  });
  render();
  async function showModelStatus() {
    try {
      const response = await fetch('/api/models');
      if (!response.ok) throw new Error('Model status unavailable');
      const data = await response.json();
      modelStatus.textContent = data.status === 'ready' ? 'Các model đã nạp sẵn, sẵn sàng sử dụng.' : data.status === 'loading' ? 'Đang nạp sẵn các model…' : 'Một số model chưa nạp được. Hãy mở lại ứng dụng bằng biểu tượng trên Desktop.';
      if (data.status === 'loading') setTimeout(showModelStatus,2000);
    } catch { modelStatus.textContent = 'Chưa kiểm tra được trạng thái model.'; }
  }
  void showModelStatus();
  const dictionaryLoaded = fetch("/spelling-dictionary.json")
    .then(response => { if (!response.ok) throw new Error("Không tải được từ điển."); return response.json(); })
    .then(data => { setDictionary(data); dictionaryState = "ready"; })
    .catch(() => { dictionaryState = "failed"; })
    .finally(() => { if (!composing) render(); });
})();
