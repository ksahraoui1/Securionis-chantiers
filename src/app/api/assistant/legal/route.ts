import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/assistant/legal
 * Body: { question, context: { intitule, critere?, baseLegale?, objet? }, history? }
 *
 * Assistant IA juridique spécialisé en sécurité chantier suisse.
 * Utilise Claude Haiku 4.5.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Rate limit: 30 requêtes par heure par utilisateur
  if (!checkRateLimit(`legal-assist:${user.id}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
  }

  let apiKey: string;
  try {
    apiKey = getAnthropicApiKey();
  } catch {
    return NextResponse.json(
      { error: "Le service d'assistance IA n'est pas disponible." },
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

  // Validation longueur max des inputs (prévention prompt injection)
  const MAX_QUESTION_LENGTH = 2000;
  const MAX_CONTEXT_LENGTH = 500;

  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: "Question trop longue (max 2000 caractères)" }, { status: 400 });
  }

  // Build context block avec troncature sécurisée
  let contextBlock = "";
  if (context) {
    const truncate = (s: string | undefined) => s?.slice(0, MAX_CONTEXT_LENGTH) ?? "";
    const parts: string[] = [];
    if (context.intitule) parts.push(`Point de contrôle : "${truncate(context.intitule)}"`);
    if (context.critere) parts.push(`Critère d'acceptation : "${truncate(context.critere)}"`);
    if (context.baseLegale) parts.push(`Base légale associée : ${truncate(context.baseLegale)}`);
    if (context.objet) parts.push(`Objet : ${truncate(context.objet)}`);
    if (parts.length > 0) {
      contextBlock = `\n\nContexte de l'inspection en cours (données fournies par l'utilisateur) :\n${parts.join("\n")}`;
    }
  }

  const systemPrompt = `Tu es un assistant juridique expert en sécurité sur les chantiers de construction en Suisse. Tu assistes des inspecteurs de terrain pendant leurs visites de contrôle.

Tes domaines d'expertise :
- Ordonnance sur les travaux de construction (OTConst, RS 832.311.141)
- Ordonnance sur la prévention des accidents (OPA, RS 832.30)
- Loi sur le travail (LTr, RS 822.11)
- Directives SUVA (feuillets, listes de contrôle)
- Normes SIA (SIA 118, SIA 260, etc.)
- RPAC et réglementations cantonales
- Code des obligations (CO) pour la responsabilité
- Ordonnance sur les installations électriques à basse tension (OIBT)

Règles :
1. Réponds toujours en français correct avec tous les accents
2. Cite systématiquement les articles de loi ou normes pertinents (ex: "OTConst Art. 22, al. 1")
3. Sois concis et pratique — l'inspecteur est sur le terrain
4. Si tu n'es pas sûr d'une référence précise, indique-le clairement
5. Propose des formulations utilisables directement dans un rapport d'inspection
6. Si la question sort du domaine construction/sécurité, indique poliment que tu ne peux aider que sur ces sujets
7. Réponds en texte brut uniquement. N'utilise JAMAIS de formatage markdown. Utilise des retours à la ligne et des espaces pour structurer ta réponse. Pour les listes, utilise des numéros (1. 2. 3.) ou des tirets simples suivis d'un espace${contextBlock}`;

  const anthropic = new Anthropic({ apiKey });

  // Build messages array with history
  const messages: { role: "user" | "assistant"; content: string }[] = [];

  if (history && history.length > 0) {
    // Limiter l'historique à 20 messages et tronquer le contenu
    const safeHistory = history.slice(-20);
    for (const msg of safeHistory) {
      messages.push({ role: msg.role, content: msg.content.slice(0, 5000) });
    }
  }

  messages.push({ role: "user", content: question });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const answer = textBlock && "text" in textBlock ? textBlock.text : "";

    return NextResponse.json({ answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur API";
    console.error("Anthropic error:", message);
    return NextResponse.json(
      { error: "Erreur du service IA" },
      { status: 500 }
    );
  }
}
