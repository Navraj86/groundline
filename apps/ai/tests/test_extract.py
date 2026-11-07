import pytest

from groundline_ai.aio import run
from groundline_ai.ingestion.extract import ExtractionError, extract_bytes, fetch_url


def test_plain_text_and_markdown() -> None:
    assert extract_bytes(b"hello", "text/plain").segments[0].text == "hello"
    assert extract_bytes(b"# Title", None, "faq.md").segments[0].text == "# Title"


def test_unsupported_type_is_a_permanent_error() -> None:
    with pytest.raises(ExtractionError):
        extract_bytes(b"\x00\x01", "application/zip", "archive.zip")


def test_invalid_pdf_is_a_permanent_error() -> None:
    with pytest.raises(ExtractionError):
        extract_bytes(b"%PDF-1.4 not really a pdf", "application/pdf")


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/admin",
        "http://localhost:4000/health",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.5/",
        "file:///etc/passwd",
        "ftp://example.com/file",
    ],
)
def test_private_and_non_http_urls_are_blocked(url: str) -> None:
    with pytest.raises(ExtractionError):
        run(fetch_url(url))
