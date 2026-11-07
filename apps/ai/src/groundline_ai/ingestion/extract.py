"""Turns uploaded files and web pages into plain text segments."""

import asyncio
import io
import ipaddress
import socket
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_FETCH_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 5
USER_AGENT = "GroundlineBot/1.0 (+knowledge base ingestion)"


class ExtractionError(Exception):
    """A permanent problem with the content itself; retrying won't help."""


@dataclass
class Segment:
    text: str
    page: int | None = None


@dataclass
class Extracted:
    segments: list[Segment]
    title: str | None = None
    metadata: dict = field(default_factory=dict)

    @property
    def character_count(self) -> int:
        return sum(len(s.text) for s in self.segments)


def extract_bytes(data: bytes, mime_type: str | None, file_name: str | None = None) -> Extracted:
    mime = (mime_type or "").split(";")[0].strip().lower()
    name = (file_name or "").lower()
    if mime == "application/pdf" or name.endswith(".pdf"):
        return _extract_pdf(data)
    if mime in {"text/plain", "text/markdown", "text/x-markdown"} or name.endswith(
        (".txt", ".md", ".markdown")
    ):
        return Extracted(segments=[Segment(_decode(data))])
    if mime == "text/html" or name.endswith((".html", ".htm")):
        return _extract_html(_decode(data))
    raise ExtractionError(f"Unsupported file type: {mime or name or 'unknown'}")


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def _extract_pdf(data: bytes) -> Extracted:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ExtractionError("The PDF is password protected.")
        segments = [
            Segment(text=text, page=i + 1)
            for i, page in enumerate(reader.pages)
            if (text := (page.extract_text() or "").strip())
        ]
    except PdfReadError as err:
        raise ExtractionError(f"The PDF could not be read: {err}") from err
    if not segments:
        raise ExtractionError(
            "No text found in the PDF. Scanned documents need OCR, which isn't supported yet."
        )
    title = (reader.metadata.title if reader.metadata else None) or None
    return Extracted(segments=segments, title=title, metadata={"pages": len(reader.pages)})


_NOISE_TAGS = [
    "script",
    "style",
    "noscript",
    "nav",
    "footer",
    "header",
    "aside",
    "form",
    "svg",
    "iframe",
]


def _extract_html(html: str) -> Extracted:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else None
    for tag in soup(_NOISE_TAGS):
        tag.decompose()
    root = soup.find("main") or soup.find("article") or soup.body or soup
    text = root.get_text("\n", strip=True)
    if not text.strip():
        raise ExtractionError("The page has no readable text.")
    return Extracted(segments=[Segment(text)], title=title)


# ---- Website sources ----------------------------------------------------------------


def _is_public_address(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as err:
        raise ExtractionError(f"Could not resolve {host}") from err
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            return False
    return True


async def _check_url(url: str, allow_private: bool) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ExtractionError("Only http and https URLs are supported.")
    if not allow_private and not await asyncio.to_thread(_is_public_address, parsed.hostname):
        # Blocks requests to internal services (SSRF).
        raise ExtractionError("This URL points to a private network address.")


async def fetch_url(url: str, *, allow_private: bool = False) -> Extracted:
    """Fetches one page, checking every redirect hop against private addresses."""
    async with httpx.AsyncClient(
        timeout=15, follow_redirects=False, headers={"user-agent": USER_AGENT}
    ) as client:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            await _check_url(current, allow_private)
            async with client.stream("GET", current) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise ExtractionError("Redirect without a location.")
                    current = urljoin(current, location)
                    continue
                if response.status_code >= 400:
                    # 4xx is permanent; 5xx may be temporary and is retried.
                    if response.status_code < 500:
                        raise ExtractionError(f"The page returned HTTP {response.status_code}.")
                    response.raise_for_status()
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_FETCH_BYTES:
                        raise ExtractionError("The page is larger than 5 MB.")
                content_type = response.headers.get("content-type", "text/html")
                extracted = extract_bytes(bytes(body), content_type, urlparse(current).path)
                extracted.metadata["final_url"] = str(current)
                return extracted
    raise ExtractionError("Too many redirects.")
