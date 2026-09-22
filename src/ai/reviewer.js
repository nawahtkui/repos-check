import { askAI } from "./client.js";

function parseAIResponse(content) {
  try {
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI response is not an object.");
    }

    return parsed;
  } catch (error) {
    throw new Error(
      `Invalid AI review JSON: ${error.message}`
    );
  }
}

export async function reviewWithAI(result) {
  const provider = process.env.AI_PROVIDER || "mock";

  const response = await askAI({
    provider,
    result
  });

  return {
    provider: response.provider,
    review: parseAIResponse(response.content)
  };
}
