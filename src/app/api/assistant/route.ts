import OpenAI from "openai";

/**
 * Music assistant endpoint, served through OpenRouter (OpenAI-compatible Chat Completions).
 * Streams plain text back to the client.
 * The song (lyrics + chords in the displayed key) is sent with every request
 * so the model always reasons about the current state of the editor.
 */

const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-5.5";

const SYSTEM = `You are the music assistant inside Transposer, an editor where people add chords to their own songs and transpose them. Many users are beginners — worship leaders, hobby guitarists, songwriters — so talk like a patient music teacher sitting next to them: warm, concrete, and brief. Explain any theory term in a few plain words the first time you use it.

What you can see: the song's lyrics, the chord symbols and which syllable each chord sits over, the section structure, and the key. What you cannot know: the melody, rhythm, tempo feel, or how it is played. Be honest about that boundary. When a question depends on the melody — whether a chord "fits", why something sounds strange, which chord would work over a specific word — say that you can't hear the melody, explain what is theoretically plausible, and give a quick way to check by ear (for example: sing or play the melody note on that word and see if it's one of the chord's notes). Keep "this chord belongs to the key" separate from "this chord fits your melody".

You never edit the song yourself. When you suggest changes, point to the exact place (section, line, and the word the chord sits over), give chords in the currently displayed key, and let the user decide. Offer one or two good options rather than many.

Formatting: write every chord symbol in backticks, like \`Em7\` or \`D/F#\`, so the app can render it as a chord chip. Prefer short paragraphs and short bullet lists; no tables, no headings larger than a bold line. Reply in the language the user writes in.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  let body: { messages?: ChatMessage[]; context?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const context = String(body.context ?? "").slice(0, 30_000);

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: { "X-Title": "Transposer" },
  });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const completion = await client.chat.completions.create(
          {
            model: MODEL,
            messages: [{ role: "system", content: `${SYSTEM}\n\n${context}` }, ...messages],
            stream: true,
          },
          { signal: req.signal },
        );
        let finish: string | null = null;
        for await (const chunk of completion) {
          const choice = chunk.choices[0];
          const text = choice?.delta?.content;
          if (text) controller.enqueue(encoder.encode(text));
          if (choice?.finish_reason) finish = choice.finish_reason;
        }
        if (finish === "length") controller.enqueue(encoder.encode("\n\n…(answer cut short)"));
        else if (finish === "content_filter") controller.enqueue(encoder.encode("\n\nSorry — I can't help with that request."));
      } catch (error) {
        let message = "Something went wrong while contacting the assistant. Please try again.";
        if (error instanceof OpenAI.AuthenticationError) message = "The assistant's API key was rejected. Check OPENROUTER_API_KEY.";
        else if (error instanceof OpenAI.NotFoundError) message = `The model “${MODEL}” isn't available for this key. Set OPENROUTER_MODEL in .env.local (e.g. anthropic/claude-sonnet-5.5).`;
        else if (error instanceof OpenAI.RateLimitError) message = "The assistant is busy (rate limited). Try again in a moment.";
        else if (error instanceof OpenAI.APIError && error.status === 402) message = "Your OpenRouter account is out of credits.";
        else if (error instanceof OpenAI.APIUserAbortError) message = "";
        else if (error instanceof OpenAI.APIError) message = `The assistant returned an error (${error.status ?? "network"}). Please try again.`;
        if (message) controller.enqueue(encoder.encode(`\n\n⚠︎ ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
