from app.services.chunking_service import ChunkingService


def test_split_text_returns_single_chunk_for_short_text() -> None:
    service = ChunkingService()
    chunks = service.split_text("短文本内容", chunk_size=50, overlap=10)
    assert len(chunks) == 1
    assert chunks[0].content == "短文本内容"


def test_split_text_preserves_order_for_long_text() -> None:
    service = ChunkingService()
    text = "第一段内容。" * 300
    chunks = service.split_text(text, chunk_size=200, overlap=20)
    assert len(chunks) > 1
    assert chunks[0].index == 1
    assert chunks[-1].index == len(chunks)
    assert all(chunk.content for chunk in chunks)


def test_derive_chunking_window_respects_model_budget() -> None:
    service = ChunkingService()
    chunk_size, overlap = service.derive_chunking_window(
        preferred_chunk_size=6000,
        preferred_overlap=500,
        llm_max_tokens=400,
    )

    assert chunk_size == 2000
    assert overlap < chunk_size
