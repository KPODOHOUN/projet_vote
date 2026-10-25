import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import { env } from "../config/env";

const chatMessageSchema = z.object({
  message: z.string().trim().min(1).max(500)
});

/** Bornes de coût OpenAI : chaque réponse est courte et le volume journalier est plafonné. */
const MAX_REPLY_TOKENS = 300;

const SYSTEM_PROMPT = `Tu es un assistant virtuel de SHADOMA Votes, une plateforme SaaS de votes payants pour l'Afrique francophone.

Tu aides les visiteurs du site (votants et organisateurs) en cas de problème.

RÈGLES IMPORTANTES :
- Réponds TOUJOURS en français (sauf si l'utilisateur écrit dans une autre langue).
- Sois poli, clair et concis. Maximum 3-4 phrases par réponse.
- Si l'utilisateur a un problème technique, propose des étapes concrètes.
- Si tu ne peux pas résoudre le problème, suggère de contacter le support à contact@shadowa.votes.
- Ne donne JAMAIS d'information sur les clés API, secrets, ou données sensibles.
- Ne parle pas de prix spécifiques (les tarifs sont définis par les organisateurs).
- Pour les problèmes de paiement, recommande de vérifier le solde mobile money et de réessayer.

CE QUE TU PEUX FAIRE :
- Expliquer comment voter (choisir un candidat, payer via Orange Money/MTN/Moov, recevoir la confirmation)
- Expliquer comment un organisateur peut créer un événement, ajouter des candidats, lancer les votes
- Aider avec les problèmes courants : paiement échoué, lien invalide, ticket perdu
- Expliquer les prérequis techniques (smartphone, connexion internet, compte mobile money)
- Guider vers les bonnes pages du site
- Expliquer le concept de vote payant et comment ça fonctionne`;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  // Daily counters live in this process only: with several API instances the
  // effective cap is multiplied by the instance count. Good enough to bound
  // cost; move to Redis if the API scales out.
  private day = "";
  private globalCount = 0;
  private readonly perIpCount = new Map<string, number>();

  isEnabled(): boolean {
    return Boolean(env.OPENAI_API_KEY);
  }

  async chat(payload: unknown, ip: string): Promise<string> {
    const { message } = chatMessageSchema.parse(payload);
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException("L'assistant n'est pas disponible.");
    }
    this.consumeDailyQuota(ip);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message }
          ],
          max_tokens: MAX_REPLY_TOKENS,
          temperature: 0.7
        })
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`OpenAI API error: ${res.status} ${text}`);
        throw new ServiceUnavailableException("L'assistant AI est temporairement indisponible.");
      }

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices[0]?.message?.content ?? "Je n'ai pas pu générer une réponse. Réessayez.";
    } catch (err) {
      this.logger.error("Chat error", err);
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException("Erreur de communication avec l'assistant AI.");
    }
  }

  private consumeDailyQuota(ip: string): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.globalCount = 0;
      this.perIpCount.clear();
    }
    const ipCount = this.perIpCount.get(ip) ?? 0;
    if (ipCount >= env.CHAT_DAILY_LIMIT_PER_IP || this.globalCount >= env.CHAT_DAILY_LIMIT) {
      throw new HttpException("L'assistant a atteint sa limite pour aujourd'hui. Réessayez demain.", HttpStatus.TOO_MANY_REQUESTS);
    }
    this.perIpCount.set(ip, ipCount + 1);
    this.globalCount += 1;
  }
}
