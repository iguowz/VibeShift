from fastapi.testclient import TestClient

from app.main import app
from app.services.llm_service import LLMService


client = TestClient(app)


def test_style_prompt_optimize_returns_optimized_prompt(monkeypatch) -> None:
    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        return (
            '{"optimized_prompt":"请用结构化要点输出，少空话，保留事实。",'
            '"notes":["added structure"],'
            '"profile_suggestion":{"audience":"产品经理","tone":"克制、直接","structure_template":"TL;DR -> 拆解 -> 建议",'
            '"emphasis_points":["关键事实","行动建议"],"citation_policy":"minimal","title_policy":"rewrite","image_focus":"diagram",'
            '"layout_format":"poster","visual_mode":"enhanced"}}'
        )

    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    response = client.post(
        "/api/style-prompts/optimize",
        json={
            "prompt": "写得更像公众号解读",
            "target": "rewrite",
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "optimized_prompt" in data
    assert "结构化" in data["optimized_prompt"]
    assert data["notes"] == ["added structure"]
    assert data["profile_suggestion"]["audience"] == "产品经理"
    assert data["profile_suggestion"]["title_policy"] == "rewrite"
    assert data["profile_suggestion"]["layout_format"] == "poster"


def test_style_prompt_recommend_returns_style_id(monkeypatch) -> None:
    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        return (
            '{"style_id":"paper","reason":"当前输入更像研究型问题，适合论文风。","confidence":0.91,'
            '"candidates":['
            '{"style_id":"paper","reason":"当前输入更像研究型问题，适合论文风。","confidence":0.91},'
            '{"style_id":"briefing","reason":"也有选型简报诉求，但研究性略弱。","confidence":0.73}'
            "]}"
        )

    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    response = client.post(
        "/api/style-prompts/recommend",
        json={
            "input_text": "请调研 FastAPI 和 Django 在中型 API 场景下的优缺点与选型建议",
            "target": "discover",
            "styles": [
                {
                    "id": "paper",
                    "name": "论文风",
                    "prompt": "写成研究报告。",
                    "audience": "研究者",
                    "tone": "严谨",
                    "structure_template": "摘要 -> 分析 -> 结论",
                    "emphasis_points": ["论据链", "结论边界"],
                    "layout_format": "paper",
                    "visual_mode": "minimal",
                },
                {
                    "id": "story",
                    "name": "故事风",
                    "prompt": "写成故事。",
                },
                {
                    "id": "briefing",
                    "name": "简报风",
                    "prompt": "写成决策简报。",
                },
            ],
            "top_k": 2,
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["style_id"] == "paper"
    assert "研究型问题" in data["reason"]
    assert len(data["candidates"]) == 2
    assert data["candidates"][1]["style_id"] == "briefing"


def test_style_prompt_optimize_fallback_is_style_aware_for_science(monkeypatch) -> None:
    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        raise RuntimeError("llm unavailable")

    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    response = client.post(
        "/api/style-prompts/optimize",
        json={
            "prompt": "写成适合中学生看的科普讲解，重点讲明白原理和常见误区。",
            "target": "rewrite",
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "科普解读 / 原理说明" in data["optimized_prompt"]
    assert "一句话讲清核心结论" in data["optimized_prompt"]
    assert "误区" in data["optimized_prompt"]
    assert "科普风" in data["notes"][0]
    assert "原理解释" in data["profile_suggestion"]["structure_template"]


def test_style_prompt_optimize_fallback_is_style_aware_for_poster_discover(monkeypatch) -> None:
    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        raise RuntimeError("llm unavailable")

    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    response = client.post(
        "/api/style-prompts/optimize",
        json={
            "prompt": "做成适合管理层快速扫读的一页海报式长图简报，突出关键数字和行动建议。",
            "target": "discover",
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "海报 / 长图 / 重点卡片" in data["optimized_prompt"]
    assert "重点卡片" in data["optimized_prompt"]
    assert "风险/不确定性" in data["optimized_prompt"]
    assert "海报风" in data["notes"][0]
    assert data["profile_suggestion"]["layout_format"] == "poster"


def test_style_prompt_preview_returns_style_openings(monkeypatch) -> None:
    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        return (
            '{"previews":['
            '{"style_id":"briefing","preview_text":"先给一句话结论：这件事最值得管理层先看的，是风险和动作窗口。","focus_points":["一句话结论","风险","动作窗口"]},'
            '{"style_id":"poster","preview_text":"大标题先立住，再把最关键的数字和动作建议压成三张重点卡。","focus_points":["大标题","重点数字","卡片结构"]}'
            "]}"
        )

    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    response = client.post(
        "/api/style-prompts/preview",
        json={
            "input_text": "帮我把这份 AI 选型说明做成适合管理层快速扫读的版本",
            "target": "rewrite",
            "style_ids": ["briefing", "poster"],
            "max_items": 2,
            "styles": [
                {
                    "id": "briefing",
                    "name": "简报风",
                    "prompt": "写成管理简报。",
                    "audience": "管理层",
                    "tone": "结论先行",
                    "structure_template": "一句话结论 -> 风险 -> 建议",
                    "emphasis_points": ["关键判断", "风险提示"],
                    "layout_format": "ppt",
                    "visual_mode": "minimal",
                },
                {
                    "id": "poster",
                    "name": "海报风",
                    "prompt": "写成长图海报。",
                    "audience": "管理层",
                    "tone": "醒目",
                    "structure_template": "大标题 -> 重点卡片 -> 行动建议",
                    "emphasis_points": ["重点数字", "行动建议"],
                    "layout_format": "poster",
                    "visual_mode": "enhanced",
                },
            ],
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["previews"]) == 2
    assert data["previews"][0]["style_id"] == "briefing"
    assert "一句话结论" in data["previews"][0]["preview_text"]
    assert data["previews"][1]["focus_points"][0] == "大标题"
