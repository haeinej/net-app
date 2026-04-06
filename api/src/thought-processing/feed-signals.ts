import { getEmbeddingService } from "../embedding";
import { llmConfig, complete } from "../llm";
import {
  RESONANCE_SIGNATURE_SYSTEM,
  resonanceSignatureUser,
  parseResonanceSignature,
} from "./prompts";

function fullText(sentence: string, context: string | null): string {
  const ctx = (context ?? "").trim();
  return ctx ? `${sentence}. ${ctx}` : sentence;
}

export type ThoughtFeedSignals = {
  surfaceEmbedding: number[];
  questionEmbedding: number[];
  qualityScore: number;
};

export async function computeThoughtFeedSignals(
  sentence: string,
  context: string | null
): Promise<ThoughtFeedSignals> {
  const normalizedContext = context ?? "";
  const text = fullText(sentence, normalizedContext);
  const embedding = getEmbeddingService();

  const surfaceEmbedding = await embedding.embed(text, "document");
  const user = resonanceSignatureUser(sentence, normalizedContext);
  const signature = parseResonanceSignature(
    await complete(
      llmConfig.provider,
      RESONANCE_SIGNATURE_SYSTEM,
      user
    )
  );
  const resonanceText = signature.resonance_phrases.join(" ");
  const tensionText = signature.tensions
    .map((tension) => tension.description)
    .join(" ");
  const resonanceSource = [resonanceText, tensionText].filter(Boolean).join(" ");
  const questionEmbedding = await embedding.embed(
    resonanceSource || sentence,
    "document"
  );
  const qualityScore = Math.min(
    1,
    signature.openness + (signature.tensions.length > 1 ? 0.1 : 0)
  );

  return {
    surfaceEmbedding,
    questionEmbedding,
    qualityScore,
  };
}
