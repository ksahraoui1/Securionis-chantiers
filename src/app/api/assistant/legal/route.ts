import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/env";

/**
 * POST /api/assistant/legal
 * Body: { question, context: { intitule, critere?, baseLegale?, objet? }, history? }
 *
 * Assistant IA juridique spécialisé en sécurité chantier suisse.
 * Répond aux questions avec références légales (OTConst, SUVA, SIA, LTr, etc.)
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let apiKey: string;
  try {
    apiKey = getAnthropicApiKey();
  } catch {
    return NextResponse.json(
      { error: "Assistant IA non configuré. Ajoutez ANTHROPIC_API_KEY dans .env.local." },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { question, context, history } = body as {
    question: string;
    context?: {
      intitule?: string;
      critere?: string;
      baseLegale?: string;
      objet?: string;
    };
    history?: { role: "user" | "assistant"; content: string }[];
  };

  if (!question?.trim()) {
    return NextResponse.json({ error: "Question requise" }, { status: 400 });
  }

  // Build context block
  let contextBlock = "";
  if (context) {
    const parts: string[] = [];
    if (context.intitule) parts.push(`Point de contrôle : "${context.intitule}"`);
    if (context.critere) parts.push(`Critère d'acceptation : "${context.critere}"`);
    if (context.baseLegale) parts.push(`Base légale associée : ${context.baseLegale}`);
    if (context.objet) parts.push(`Objet : ${context.objet}`);
    if (parts.length > 0) {
      contextBlock = `\n\nContexte de l'inspection en cours :\n${parts.join("\n")}`;
    }
  }

  const systemPrompt = `Tu es un assistant juridique expert en sécurité sur les chantiers de construction en Suisse. Tu assistes des inspecteurs de terrain pendant leurs visites de contrôle.

Tes domaines d'expertise :
- Ordonnance sur les travaux de construction (OTConst, RS 832.311.141)
- Ordonnance sur la prévention des accidents (OPA, RS 832.30)
- Loi sur le travail (LTr, RS 822.11)
- Directives SUVA (feuillets, listes de contrôle)
- Normes SIA (SIA 118, SIA 260, etc.)
- RPAC (Règlement sur le plan d'affectation communal) et réglementations cantonales
- Code des obligations (CO) pour la responsabilité
- Ordonnance sur les installations électriques à basse tension (OIBT)

Règles :
1. Réponds toujours en français
2. Cite systématiquement les articles de loi ou normes pertinents (ex: "OTConst Art. 22, al. 1")
3. Sois concis et pratique — l'inspecteur est sur le terrain
4. Si tu n'es pas sûr d'une référence précise, indique-le clairement
5. Propose des formulations utilisables directement dans un rapport d'inspection
6. Si la question sort du domaine construction/sécurité, indique poliment que tu ne peux aider que sur ces sujets
7. IMPORTANT : Réponds en texte brut uniquement. N'utilise JAMAIS de formatage markdown (pas d'étoiles, de dièses, d'accents graves). Utilise des retours à la ligne et des espaces pour structurer ta réponse. Pour les listes, utilise des numeros (1. 2. 3.) ou des tirets simples suivis d'un espace${contextBlock}`;

  const anthropic = new Anthropic({ apiKey });

  // Build messages array with history
  const messages: { role: "user" | "assistant"; content: string }[] = [];

  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: question });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const answer = textBlock && "text" in textBlock ? textBlock.text : "";

    return NextResponse.json({ answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur API";
    return NextResponse.json(
      { error: `Erreur assistant IA : ${message}` },
      { status: 500 }
    );
  }
}
