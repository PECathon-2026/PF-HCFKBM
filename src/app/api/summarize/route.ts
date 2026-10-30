import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Strip HTML tags and normalize whitespace for token efficiency
function cleanHtmlContent(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { content, title, apiKey: clientApiKey } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Article content is required for summarization",
          code: "MISSING_CONTENT",
        },
        { status: 400 }
      );
    }

    // Direct Gemini API Key loaded from environment
    const geminiKey =
      clientApiKey?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();

    if (!geminiKey) {
      return NextResponse.json(
        {
          error:
            "No Google Gemini API key configured. Please set GEMINI_API_KEY in your environment.",
          code: "MISSING_API_KEY",
        },
        { status: 500 }
      );
    }

    // Clean and cap content to ~30,000 characters to ensure thorough context
    const cleanedText = cleanHtmlContent(content).slice(0, 30000);
    const articleTitle = title ? String(title).slice(0, 300) : "Untitled Article";

    const promptText = `You are a distinguished research analyst and executive technology editor for top engineering and systems publications.

Produce a comprehensive, rigorous, and highly detailed executive briefing on the following article. The summary must be substantial, thorough, and analytical—not brief or shallow.

CRITICAL REQUIREMENT: Do NOT use any emojis anywhere in your response. Maintain an authoritative, professional, and elegant editorial tone throughout.

Format your response in clean Markdown with these EXACT headings and structure:

### Executive Overview
Write a thorough, multi-paragraph synthesis (150-250 words) detailing the foundational thesis, the author's technical motivation, the systemic or architectural problem being addressed, and the core premise of the post.

### Key Analysis & Technical Findings
Provide 5 to 7 detailed, high-signal bullet points analyzing the central arguments, mechanisms, design choices, benchmarks, or technical solutions:
- **Concept Name**: Thorough explanation detailing how this component or concept works, why it matters, and its direct engineering implications.
- **Concept Name**: Thorough explanation detailing the tradeoffs, performance characteristics, or architectural principles discussed.
(Ensure every bullet point is informative and deep, 2 to 4 complete sentences each)

### Strategic Implications & Conclusion
Write an authoritative concluding analysis (1-2 substantial paragraphs) synthesizing what this development means for software engineers, systems designers, and the broader tech landscape, highlighting practical takeaways and critical lessons.

---
Article Title: ${articleTitle}
Article Content:
${cleanedText}`;

    // Target Gemini 2.5 Flash / Flash Latest (fast, high throughput, current generation)
    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-flash-latest",
      "gemini-2.5-flash-lite",
      "gemini-pro-latest",
      "gemini-1.5-flash",
    ];
    let lastError = "";

    for (const model of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

      try {
        const geminiRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: promptText }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2500,
            },
          }),
          signal: AbortSignal.timeout(25000),
        });

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const candidate = data?.candidates?.[0];
          const summaryText = candidate?.content?.parts?.[0]?.text;

          if (summaryText && summaryText.trim().length > 0) {
            return NextResponse.json({
              success: true,
              summary: summaryText.trim(),
              model,
            });
          }
        }

        const errData = await geminiRes.json().catch(() => null);
        lastError =
          errData?.error?.message ||
          `Gemini API returned status ${geminiRes.status} for ${model}`;

        // If the key is specifically invalid, stop trying other models
        if (
          geminiRes.status === 400 &&
          (lastError.includes("API_KEY_INVALID") || lastError.includes("API key not valid"))
        ) {
          return NextResponse.json(
            {
              error: "Invalid Gemini API key. Please check your key at Google AI Studio.",
              code: "INVALID_API_KEY",
              details: lastError,
            },
            { status: 400 }
          );
        }

        // If quota exceeded
        if (geminiRes.status === 429) {
          return NextResponse.json(
            {
              error: "Gemini API rate limit or quota exceeded. Please wait a moment.",
              code: "RATE_LIMITED",
              details: lastError,
            },
            { status: 429 }
          );
        }
      } catch (subErr) {
        lastError = subErr instanceof Error ? subErr.message : String(subErr);
      }
    }

    return NextResponse.json(
      {
        error: "Failed to generate summary with Gemini",
        code: "GEMINI_ERROR",
        details: lastError,
      },
      { status: 502 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "Internal server error during summarization",
        code: "SERVER_ERROR",
        details: message,
      },
      { status: 500 }
    );
  }
}
