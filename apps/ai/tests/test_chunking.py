from groundline_ai.ingestion.chunking import MAX_CHARS, OVERLAP_CHARS, chunk_segments
from groundline_ai.ingestion.extract import Segment, extract_bytes


def test_short_text_is_one_chunk() -> None:
    chunks = chunk_segments([Segment("Refunds are available within 30 days of purchase.")])
    assert len(chunks) == 1
    assert chunks[0].content.startswith("Refunds")


def test_long_text_splits_with_overlap_and_bounded_size() -> None:
    paragraphs = [
        f"Paragraph {i}. " + "The quick brown fox jumps over the lazy dog. " * 8 for i in range(20)
    ]
    chunks = chunk_segments([Segment("\n\n".join(paragraphs))])
    assert len(chunks) > 3
    assert all(len(c.content) <= MAX_CHARS + OVERLAP_CHARS for c in chunks)
    # Consecutive chunks share text so answers spanning a boundary still retrieve.
    assert chunks[0].content[-50:] in chunks[1].content
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_run_on_paragraph_is_split() -> None:
    chunks = chunk_segments([Segment("word " * 2000)])
    assert len(chunks) > 1


def test_pages_are_tracked() -> None:
    chunks = chunk_segments(
        [
            Segment("Page one text about billing.", page=1),
            Segment("Page two about refunds.", page=2),
        ]
    )
    assert chunks[0].pages == [1, 2]


def test_html_extraction_drops_navigation_and_scripts() -> None:
    html = b"""<html><head><title>Help Center</title><script>var x=1</script></head>
    <body><nav>Home | Pricing</nav><main><h1>Refunds</h1><p>We refund within 30 days.</p></main>
    <footer>(c) Acme</footer></body></html>"""
    extracted = extract_bytes(html, "text/html")
    text = extracted.segments[0].text
    assert extracted.title == "Help Center"
    assert "We refund within 30 days." in text
    assert "Pricing" not in text and "var x" not in text and "Acme" not in text
