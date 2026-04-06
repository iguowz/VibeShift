from dataclasses import dataclass


@dataclass(slots=True)
class TextChunk:
    index: int
    content: str


class ChunkingService:
    def derive_chunking_window(self, *, preferred_chunk_size: int, preferred_overlap: int, llm_max_tokens: int) -> tuple[int, int]:
        estimated_budget = max(1, llm_max_tokens) * 5
        chunk_size = max(1800, min(preferred_chunk_size, estimated_budget))
        overlap = max(180, min(preferred_overlap, chunk_size // 8))
        if overlap >= chunk_size:
            overlap = max(0, chunk_size // 10)
        return chunk_size, overlap

    def split_text(self, text: str, chunk_size: int, overlap: int) -> list[TextChunk]:
        if chunk_size <= 0:
            raise ValueError("chunk_size 必须大于 0")
        if overlap < 0:
            raise ValueError("overlap 不能小于 0")
        if overlap >= chunk_size:
            raise ValueError("overlap 必须小于 chunk_size")

        normalized = text.strip()
        if len(normalized) <= chunk_size:
            return [TextChunk(index=1, content=normalized)]

        chunks: list[TextChunk] = []
        start = 0
        index = 1
        while start < len(normalized):
            end = min(start + chunk_size, len(normalized))
            if end < len(normalized):
                breakpoint_candidates = [
                    normalized.rfind("\n\n", start, end),
                    normalized.rfind("\n", start, end),
                    normalized.rfind("。", start, end),
                    normalized.rfind("！", start, end),
                    normalized.rfind("？", start, end),
                ]
                best_break = max(breakpoint_candidates)
                if best_break > start + chunk_size // 2:
                    end = best_break + 1

            content = normalized[start:end].strip()
            if content:
                chunks.append(TextChunk(index=index, content=content))
                index += 1
            if end >= len(normalized):
                break
            start = max(0, end - overlap)
        return chunks
