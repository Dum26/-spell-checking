"""Download pinned, safetensors-only spelling models; never load remote Python code."""
import json
import os
import ssl
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.spell-runtime')]
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
if sys.platform == 'win32' and 'REQUESTS_CA_BUNDLE' not in os.environ:
    # Use the same trusted certificate authorities as Windows for HTTPS downloads.
    bundle = ROOT / '.cache' / 'download-ca.pem'
    bundle.parent.mkdir(parents=True, exist_ok=True)
    bundle.write_text(''.join(ssl.DER_cert_to_PEM_cert(cert) for cert in ssl.create_default_context().get_ca_certs(binary_form=True)), encoding='ascii')
    os.environ['REQUESTS_CA_BUNDLE'] = str(bundle)
from huggingface_hub import snapshot_download

MODELS = {
    'bartpho': ('bmd1905/vietnamese-correction-v2', 'a3d342348d39d87622aa58aabd07de38ade8c17b'),
    'vn-base': ('nrl-ai/vn-spell-correction-base', 'ba1e57fc3bacdfb22bfa20b19db7182a6d1b0b6b'),
    'protonx': ('protonx-models/protonx-legal-tc', '2007b3f3e577dcbebf0e5c435bfe041584920cd1'),
}

if __name__ == '__main__':
    names = sys.argv[1:] or ['bartpho']
    if any(name not in MODELS for name in names):
        raise SystemExit('Model must be bartpho, vn-base or protonx')
    for name in names:
        model, revision = MODELS[name]
        print(f'Downloading {name}: {model}', flush=True)
        destination = ROOT / '.spell-models' / name
        snapshot_download(repo_id=model, revision=revision, local_dir=str(destination), max_workers=2,
                          allow_patterns=['*.json', '*.model', 'dict.txt', 'model.safetensors', 'README.md', 'LICENSE.md'])
        print(f'Ready: {name}', flush=True)
    print(json.dumps({name: MODELS[name][0] for name in names}), flush=True)
