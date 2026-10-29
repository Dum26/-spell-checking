"""Persistent local spelling worker. Requests and responses are JSON lines."""
import contextlib
from functools import lru_cache
import json
import os
import re
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.spell-runtime')]
os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')


@lru_cache(maxsize=3)
def load_model(engine):
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    if engine not in ('bartpho', 'vn-base', 'protonx'):
        raise ValueError('Mô hình sửa chính tả không hợp lệ.')
    directory = ROOT / '.spell-models' / engine
    if not (directory / 'model.safetensors').is_file():
        raise ValueError(f'Chưa có model {engine}; chạy scripts/setup-spelling-ai.py {engine} trước.')
    torch.set_num_threads(min(2, os.cpu_count() or 1))
    tokenizer = AutoTokenizer.from_pretrained(directory, local_files_only=True, trust_remote_code=False, use_fast=engine == 'protonx')
    model = AutoModelForSeq2SeqLM.from_pretrained(directory, local_files_only=True,
        trust_remote_code=False, use_safetensors=True, torch_dtype=torch.float32).eval()
    # Reduce the CPU model's RAM footprint.
    model = torch.ao.quantization.quantize_dynamic(model, {torch.nn.Linear}, dtype=torch.qint8, inplace=True)
    return tokenizer, model


def correct(text, engine='bartpho'):
    if engine == 'bartpho-protonx':
        return correct(text, 'bartpho') + correct(text, 'protonx')
    import torch
    rows = text.splitlines(keepends=True)
    tokenizer, model = load_model(engine)
    corrected = []
    for row in rows:
        content = row.rstrip('\r\n')
        ending = row[len(content):]
        if not content.strip():
            corrected.append(row)
            continue
        encoded = tokenizer(content, return_tensors='pt', truncation=False)
        limit = 160 if engine == 'protonx' else 256
        if encoded['input_ids'].shape[1] > limit:
            raise ValueError('Một dòng quá dài cho AI; hãy chia văn bản thành các dòng ngắn hơn.')
        with torch.inference_mode():
            generated = model.generate(**encoded, max_new_tokens=160, num_beams=4 if engine == 'protonx' else 1, do_sample=False)
        candidate = tokenizer.decode(generated[0], skip_special_tokens=True).strip()
        # Spelling models tend to append sentence punctuation to product names.
        if not re.search(r'[.!?]$', content.rstrip()):
            candidate = re.sub(r'[.!?]+$', '', candidate).rstrip()
        leading = content[:len(content) - len(content.lstrip())]
        trailing = content[len(content.rstrip()):]
        corrected.append(leading + candidate + trailing + ending)
    return [{'model': engine, 'text': ''.join(corrected)}]


def warm_models():
    models, errors = {}, {}
    for engine in ('vn-base', 'bartpho', 'protonx'):
        try:
            correct('tôi muốn mua M10', engine)
            models[engine] = 'ready'
        except Exception as error:
            models[engine] = 'error'
            errors[engine] = str(error)
    return {'models': models, 'errors': errors}


def main():
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps({'ready': True, 'pid': os.getpid()}), flush=True)
    for line in sys.stdin:
        started = time.perf_counter()
        try:
            request = json.loads(line)
            if request.get('warmup') is True:
                with contextlib.redirect_stdout(sys.stderr):
                    result = warm_models()
                result['elapsedMs'] = round((time.perf_counter()-started)*1000)
                print(json.dumps(result, ensure_ascii=False), flush=True)
                continue
            text = request.get('text')
            if not isinstance(text, str) or not text.strip() or len(text) > 2000 or len(text.splitlines()) > 12:
                raise ValueError('AI nhận tối đa 2.000 ký tự và 12 dòng mỗi lượt.')
            with contextlib.redirect_stdout(sys.stderr):
                candidates = correct(text, request.get('engine', 'bartpho'))
            result = {'candidates': candidates, 'elapsedMs': round((time.perf_counter()-started)*1000)}
        except Exception as error:
            print(f'Spelling AI error: {error}', file=sys.stderr, flush=True)
            result = {'error': str(error) if isinstance(error, ValueError) else 'Không chạy được AI local. Kiểm tra môi trường và model.',
                      'status': 422 if isinstance(error, ValueError) else 500}
        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
