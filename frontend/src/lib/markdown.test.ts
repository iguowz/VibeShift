import { describe, expect, it } from "vitest";

import { detectRichTextFormat, renderMarkdownToHtml } from "./markdown";

describe("markdown pretext rendering", () => {
  it("renders pretext stats, chart and flow blocks into rich html", () => {
    const html = renderMarkdownToHtml(`
## 示例

\`\`\`pretext stats
{"items":[{"label":"可用来源","value":"12","note":"其中高可信 8 条"}]}
\`\`\`

\`\`\`pretext chart
{"title":"来源可信度","unit":"分","items":[{"label":"官方资料","value":9.6,"note":"优先采用"},{"label":"社区帖子","value":5.4,"note":"仅作线索"}]}
\`\`\`

\`\`\`pretext flow
{"title":"落地流程","steps":[{"title":"明确目标","detail":"先确定输出场景"},{"title":"筛选来源","detail":"优先高可信来源"}]}
\`\`\`
`);

    expect(html).toContain("pretext-stats");
    expect(html).toContain("可用来源");
    expect(html).toContain("pretext-chart");
    expect(html).toContain("来源可信度");
    expect(html).toContain("pretext-flow");
    expect(html).toContain("落地流程");
    expect(html).not.toContain("&lt;article");
    expect(html).not.toContain("<pre><code>&lt;section");
  });

  it("treats markdown mixed with inline html blocks as markdown", () => {
    const mixed = "## 标题\n\n<div class=\"pretext-block\">图表</div>\n\n- 要点一";
    expect(detectRichTextFormat(mixed)).toBe("markdown");
  });
});
