import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGeminiApiKey } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/assistant/legal
 * Body: { question, context: { intitule, critere?, baseLegale?, objet? }, history? }
 *
 * Assistant IA juridique spécialisé en sécurité chantier suisse.
 * Utilise Gemini 2.5 Flash.
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
    apiKey = getGeminiApiKey();
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

  const systemInstruction = `Tu es un assistant juridique expert en sécurité sur les chantiers de construction en Suisse. Tu assistes des inspecteurs de terrain pendant leurs visites de contrôle.

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

  // Build Gemini conversation contents
  const contents: { role: string; parts: { text: string }[] }[] = [];

  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      });
    }
  }

  contents.push({
    role: "user",
    parts: [{ text: question }],
  });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents,
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.3,
          },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error("Gemini API error:", errBody);
      return NextResponse.json(
        { error: "Erreur du service IA" },
        { status: 500 }
      );
    }

    const geminiData = await geminiRes.json();
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return NextResponse.json({ answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur API";
    console.error("Gemini error:", message);
    return NextResponse.json(
      { error: "Erreur du service IA" },
      { status: 500 }
    );
  }
}
