import { requireApiUser } from "@/lib/supabase/require-api-user";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAllowedSupabaseUrl } from "@/lib/utils/security";
import { referenceStockage } from "@/lib/utils/storage-reference";

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

  const { user, response: authResponse } = await requireApiUser(supabase);
  if (authResponse) return authResponse;

  // Rate limit: 20 analyses par heure par utilisateur
  if (!(await checkRateLimit(`photo-analyze:${user.id}`, 20, 60 * 60 * 1000))) {
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
  const { imageUrl, pointControle, critere, visiteId } = body as {
    imageUrl: string;
    pointControle?: string;
    critere?: string;
    visiteId: string;
  };

  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl requis" }, { status: 400 });
  }

  if (!visiteId) {
    return NextResponse.json({ error: "visiteId requis" }, { status: 400 });
  }

  // SSRF protection: whitelist stricte du hostname Supabase
  if (!isAllowedSupabaseUrl(imageUrl)) {
    return NextResponse.json({ error: "URL non autorisée" }, { status: 400 });
  }

  // Le bucket est privé (SEC-03) : l'URL canonique n'est qu'un identifiant.
  // On la retraduit en chemin, lié à la visite (<chantier>/<visite>/…), puis
  // on télécharge avec le client de l'utilisateur — la RLS s'applique.
  const reference = referenceStockage(imageUrl);
  if (
    !reference ||
    reference.bucket !== "visite-photos" ||
    reference.chemin.split("/")[1] !== visiteId
  ) {
    return NextResponse.json({ error: "Photo hors de cette visite" }, { status: 400 });
  }

  // Vérifier l'accès à la visite (obligatoire)
  const { canAccessVisite } = await import("@/lib/utils/security");
  if (!(await canAccessVisite(supabase, user.id, visiteId))) {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  // Fetch the image and convert to base64
  let imageBase64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 Mo

  try {
    const parametres = { signal: AbortSignal.timeout(15_000), redirect: "error" as const };
    const { data: fichier, error: erreurFichier } = await supabase.storage
      .from("visite-photos")
      .download(reference.chemin, {}, parametres);
    if (erreurFichier || !fichier) throw new Error(erreurFichier?.message ?? "Photo inaccessible");

    if (fichier.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "Image trop volumineuse (max 10 Mo)" }, { status: 400 });
    }

    const octets = Buffer.from(await fichier.arrayBuffer());
    // Type déduit des octets : le bucket n'accepte que JPEG et PNG.
    if (octets.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      mediaType = "image/png";
    } else if (octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) {
      mediaType = "image/jpeg";
    } else {
      return NextResponse.json({ error: "Le fichier n'est pas une image" }, { status: 400 });
    }
    imageBase64 = octets.toString("base64");
  } catch (err) {
    console.error("[photos/analyze] Chargement de la photo impossible :", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Impossible de charger l'image pour l'analyse" },
      { status: 400 }
    );
  }

  // Build context — tronquer les inputs utilisateur pour limiter le prompt injection
  const MAX_CTX = 500;
  let context = "";
  if (pointControle) {
    context += `\nPoint de contrôle en cours : "${pointControle.slice(0, MAX_CTX)}"`;
  }
  if (critere) {
    context += `\nCritère d'acceptation : "${critere.slice(0, MAX_CTX)}"`;
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 10000,
      },
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
