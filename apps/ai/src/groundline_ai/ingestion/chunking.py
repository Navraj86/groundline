"""Splits extracted text into overlapping chunks sized for embedding and retrieval."""

import re
from dataclasses import dataclass, field

from groundline_ai.ingestion.extract import Segment

TARGET_CHARS = 1200
MAX_CHARS = 1600
OVERLAP_CHARS = 200

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


@dataclass
class Chunk:
    index: int
    content: str
    pages: list[int] = field(default_factory=list)

    @property
    def token_count(self) -> int:
        # ~4 characters per token for English text; good enough for budgeting.
        return max(1, len(self.content) // 4)


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _pieces(text: str) -> list[str]:
    """Paragraphs, with any paragraph longer than MAX_CHARS split at sentence boundaries."""
    pieces: list[str] = []
    for para in (p.strip() for p in text.split("\n\n")):
        if not para:
            continue
        if len(para) <= MAX_CHARS:
            pieces.append(para)
            continue
        current = ""
        for sentence in _SENTENCE_END.split(para):
            while len(sentence) > MAX_CHARS:  # a run-on "sentence": hard split
                pieces.append(sentence[:MAX_CHARS])
                sentence = sentence[MAX_CHARS:]
            if current and len(current) + 1 + len(sentence) > TARGET_CHARS:
                pieces.append(current)
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        if current:
            pieces.append(current)
    return pieces


def _tail(text: str) -> str:
    """The last ~OVERLAP_CHARS of a chunk, starting at a word boundary."""
    if len(text) <= OVERLAP_CHARS:
        return text
    tail = text[-OVERLAP_CHARS:]
    space = tail.find(" ")
    return tail[space + 1 :] if space != -1 else tail


def chunk_segments(segments: list[Segment]) -> list[Chunk]:
    chunks: list[Chunk] = []
    buffer = ""
    pages: set[int] = set()

    def flush() -> None:
        nonlocal buffer, pages
        if buffer.strip():
            chunks.append(Chunk(index=len(chunks), content=buffer.strip(), pages=sorted(pages)))
            buffer = _tail(buffer)
            pages = set()

    for segment in segments:
        for piece in _pieces(_normalize(segment.text)):
            if buffer and len(buffer) + 2 + len(piece) > TARGET_CHARS:
                flush()
            buffer = f"{buffer}\n\n{piece}" if buffer else piece
            if segment.page is not None:
                pages.add(segment.page)

    # Don't emit a final chunk that is only the overlap of the previous one.
    if buffer.strip() and (not chunks or not chunks[-1].content.endswith(buffer.strip())):
        chunks.append(Chunk(index=len(chunks), content=buffer.strip(), pages=sorted(pages)))
    return chunks
