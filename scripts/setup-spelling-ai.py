"""Download pinned, safetensors-only spelling models; never load remote Python code."""
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.spell-runtime')]
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
from huggingface_hub import snapshot_download

MODELS = {
    'bartpho': ('bmd1905/vietnamese-correction-v2', 'a3d342348d39d87622aa58aabd07de38ade8c17b'),
}

if __name__ == '__main__':
    for name, (model, revision) in MODELS.items():
        print(f'Downloading {name}: {model}', flush=True)
        destination = ROOT / '.spell-models' / name
        snapshot_download(repo_id=model, revision=revision, local_dir=str(destination), max_workers=2,
                          allow_patterns=['*.json', '*.model', 'dict.txt', 'model.safetensors', 'README.md'])
        print(f'Ready: {name}', flush=True)
    print(json.dumps({name: model for name, (model, _) in MODELS.items()}), flush=True)
