import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/env";

/**
 * POST /api/photos/analyze
 * Body: { imageUrl: string, pointControle?: string, critere?: string }
 *
 * Sends the photo to Claude Vision to detect:
 * - Missing safety equipment (helmets, harnesses, guardrails)
 * - Risk zones
 * - Visual non-conformities
 *
 * Returns a suggested remark and conformity assessment.
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
      { error: "Analyse IA non configurée. Ajoutez ANTHROPIC_API_KEY dans .env.local." },
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

  // Fetch the image and convert to base64
  let imageBase64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  try {
    const imgRes = await fetch(imageUrl);
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

  // Build context prompt
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
      model: "claude-sonnet-4-20250514",
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

Analyse cette photo de chantier et identifie :
1. **Équipements de protection manquants** (casques, harnais, garde-corps, filets, balisage, etc.)
2. **Zones à risque** visibles (travail en hauteur sans protection, échafaudage instable, câbles exposés, etc.)
3. **Non-conformités visuelles** par rapport aux normes de construction suisses
${context}

Réponds en JSON avec cette structure exacte :
{
  "dangers": [
    { "type": "equipement_manquant" | "zone_risque" | "non_conformite", "description": "description courte", "severite": "critique" | "majeur" | "mineur" }
  ],
  "remarqueSuggeree": "Une remarque concise (1-3 phrases) que l'inspecteur peut utiliser dans son rapport, en français",
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

    // Extract text from response
    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";

    // Parse JSON (handle possible markdown code blocks)
    const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({
        dangers: [],
        remarqueSuggeree: raw.slice(0, 500),
        conformite: "indetermine",
        confiance: 0,
        raw,
      });
    }

    return NextResponse.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur API";
    return NextResponse.json(
      { error: `Erreur lors de l'analyse IA : ${message}` },
      { status: 500 }
    );
  }
}
