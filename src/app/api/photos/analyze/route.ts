import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/photos/analyze
 * Body: { imageUrl: string, pointControle?: string, critere?: string }
 *
 * Envoie la photo à Claude Haiku 4.5 pour détecter :
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
    apiKey = getAnthropicApiKey();
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
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) throw new Error("Impossible de charger l'image");

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    if (contentType.includes("png")) {
      mediaType = "image/png";
    } else if (contentType.includes("webp")) {
      mediaType = "image/webp";
    } else {
      mediaType = "image/jpeg";
    }

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

  const anthropic = new Anthropic({ apiKey });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `Tu es un expert en sécurité sur les chantiers de construction en Suisse (normes SUVA, OTConst, SIA).

IMPORTANT : Tu DOIS écrire en français correct avec TOUS les accents (é, è, ê, à, ù, ô, î, ç, etc.).

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

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";

    // Parse JSON — nettoyer les blocs markdown si présents
    let jsonStr = raw.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
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
    console.error("Anthropic error:", message);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse IA" },
      { status: 500 }
    );
  }
}
