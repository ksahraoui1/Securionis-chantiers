import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGeminiApiKey } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/photos/analyze
 * Body: { imageUrl: string, pointControle?: string, critere?: string }
 *
 * Envoie la photo à Gemini 2.5 Flash pour détecter :
 * - Équipements de protection manquants
 * - Zones à risque
 * - Non-conformités visuelles
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Rate limit: 20 analyses par heure par utilisateur
  if (!checkRateLimit(`photo-analyze:${user.id}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
  }

  let apiKey: string;
  try {
    apiKey = getGeminiApiKey();
  } catch {
    return NextResponse.json(
      { error: "Le service d'analyse IA n'est pas disponible." },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { imageUrl, pointControle, critere } = body as {
    imageUrl: string;
    pointControle?: string;
    critere?: string;
  };

  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl requis" }, { status: 400 });
  }

  // SSRF protection: only allow Supabase storage URLs
  try {
    const parsedUrl = new URL(imageUrl);
    if (!parsedUrl.hostname.endsWith("supabase.co") && !parsedUrl.hostname.endsWith("supabase.in")) {
      return NextResponse.json({ error: "URL non autorisée" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "URL invalide" }, { status: 400 });
  }

  // Fetch the image and convert to base64
  let imageBase64: string;
  let mimeType: string;

  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) throw new Error("Impossible de charger l'image");

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    mimeType = contentType.split(";")[0].trim();

    const buffer = await imgRes.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString("base64");
  } catch {
    return NextResponse.json(
      { error: "Impossible de charger l'image pour l'analyse" },
      { status: 400 }
    );
  }

  // Build context
  let context = "";
  if (pointControle) {
    context += `\nPoint de contrôle en cours : "${pointControle}"`;
  }
  if (critere) {
    context += `\nCritère d'acceptation : "${critere}"`;
  }

  const prompt = `Tu es un expert en sécurité sur les chantiers de construction en Suisse (normes SUVA, OTConst, SIA).

IMPORTANT : Tu DOIS écrire en français correct avec TOUS les accents (é, è, ê, à, ù, ô, î, ç, etc.). Ne jamais omettre les accents. Par exemple : "sécurité", "échafaudage", "conformité", "contrôlé", "détecté", "protégé", "éclairage", "général".

Analyse cette photo de chantier et identifie :
1. Les équipements de protection manquants (casques, harnais, garde-corps, filets, balisage, etc.)
2. Les zones à risque visibles (travail en hauteur sans protection, échafaudage instable, câbles exposés, etc.)
3. Les non-conformités visuelles par rapport aux normes de construction suisses
${context}

Réponds en JSON avec cette structure exacte :
{
  "dangers": [
    { "type": "equipement_manquant" | "zone_risque" | "non_conformite", "description": "description courte en français avec accents", "severite": "critique" | "majeur" | "mineur" }
  ],
  "remarqueSuggeree": "Une remarque concise (1-3 phrases) en français correct avec tous les accents, utilisable dans un rapport d'inspection. Texte brut uniquement, sans formatage.",
  "conformite": "conforme" | "non_conforme" | "indetermine",
  "confiance": 0.0-1.0
}

Si la photo ne montre pas de chantier ou n'est pas analysable, retourne :
{ "dangers": [], "remarqueSuggeree": "", "conformite": "indetermine", "confiance": 0 }

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error("Gemini API error:", errBody);
      return NextResponse.json(
        { error: "Erreur lors de l'analyse IA" },
        { status: 500 }
      );
    }

    const geminiData = await geminiRes.json();
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse JSON — nettoyer les blocs markdown si présents
    let jsonStr = raw.trim();
    // Retirer ```json ... ``` ou ``` ... ```
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      // Fallback : essayer d'extraire le JSON entre { et }
      const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          analysis = JSON.parse(braceMatch[0]);
        } catch {
          return NextResponse.json({
            dangers: [],
            remarqueSuggeree: "",
            conformite: "indetermine",
            confiance: 0,
          });
        }
      } else {
        return NextResponse.json({
          dangers: [],
          remarqueSuggeree: "",
          conformite: "indetermine",
          confiance: 0,
        });
      }
    }

    return NextResponse.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur API";
    console.error("Gemini error:", message);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse IA" },
      { status: 500 }
    );
  }
}
