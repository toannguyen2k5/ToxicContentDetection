"""Vietnamese segmentation used by the SVM and PhoBERT training pipelines."""
import os
from pathlib import Path
from threading import Lock
from typing import Any

_SEGMENTER_LOCK = Lock()
_SEGMENTER: Any = None


def tokenize(text: str) -> list[str]:
    from underthesea import word_tokenize

    if not text.strip():
        return []
    return word_tokenize(text, format="text").split()


def _phobert_segmenter():
    global _SEGMENTER

    if _SEGMENTER is None:
        with _SEGMENTER_LOCK:
            if _SEGMENTER is None:
                _SEGMENTER = _load_phobert_segmenter()
    return _SEGMENTER


def _is_complete(save_dir: Path) -> bool:
    jar_path = save_dir / "VnCoreNLP-1.2.jar"
    rdr_path = save_dir / "models" / "wordsegmenter" / "wordsegmenter.rdr"
    return jar_path.is_file() and rdr_path.is_file()


def _load_phobert_segmenter():
    import shutil
    import py_vncorenlp

    save_dir = Path(
        os.getenv(
            "VNCORENLP_HOME",
            str(Path(__file__).parent / "vncorenlp"),
        )
    ).resolve()

    # Chỉ tải khi thiếu file. Trong Docker, model đã được tải sẵn lúc build.
    if not _is_complete(save_dir):
        models_dir = save_dir / "models"
        if models_dir.exists():
            shutil.rmtree(models_dir, ignore_errors=True)

        save_dir.mkdir(parents=True, exist_ok=True)

        # py_vncorenlp.download_model() tải file vào thư mục làm việc hiện tại
        # rồi shutil.move sang save_dir. Chuyển cwd vào save_dir để file nằm
        # cùng ổ đĩa (tránh "Invalid cross-device link" khi save_dir là volume).
        old_cwd = os.getcwd()
        try:
            os.chdir(save_dir)
            py_vncorenlp.download_model(save_dir=str(save_dir))
        finally:
            os.chdir(old_cwd)

    # Không tiếp tục nếu tải mô hình không thành công.
    if not _is_complete(save_dir):
        raise RuntimeError(f"VnCoreNLP model is incomplete: {save_dir}")

    return py_vncorenlp.VnCoreNLP(
        annotators=["wseg"],
        save_dir=str(save_dir),
    )


def segment_phobert(text: str) -> str:
    if not text.strip():
        return ""
    segments = _phobert_segmenter().word_segment(text.strip())
    return " ".join(segments)