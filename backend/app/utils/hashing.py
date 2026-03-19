import hashlib
from pathlib import Path


def sha256_file(file_path: str | Path, chunk_size: int = 1024 * 1024) -> str:
    path = Path(file_path)
    digest = hashlib.sha256()

    with path.open("rb") as f:
        while chunk := f.read(chunk_size):
            digest.update(chunk)

    return digest.hexdigest()