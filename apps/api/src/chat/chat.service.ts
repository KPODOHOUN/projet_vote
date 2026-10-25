import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import { env } from "../config/env";

const chatMessageSchema = z.object({
  message: z.string().trim().min(1).max(500)
});

/** Bornes de coût OpenAI : chaque réponse est courte et le volume journalier est plafonné. */
const MAX_REPLY_TOKENS = 300;

/**
 * Prompt système, audité contre le produit réel (Lot D0-1). Il ne cite aucun
 * taux, délai, opérateur ni promesse que le code ne tient pas ; le test
 * chat.service.test.ts refuse les termes interdits.
 */
export const CHAT_SYSTEM_PROMPT = `Tu es l'assistant du site SHADOMA Votes, un outil de concours à votes payants en FCFA.

Ce que fait le produit, et seulement cela :
- Un organisateur crée un compte, confirme son e-mail, crée un concours, ses candidats et le prix d'une voix. Sans prix, personne ne peut voter.
- Le votant n'a pas de compte. Sur la page du candidat, il choisit le nombre de voix, saisit son numéro Mobile Money et choisit son réseau parmi ceux affichés dans le formulaire.
- Il valide ensuite la demande de paiement sur son téléphone. La voix compte seulement quand le paiement est confirmé, pas quand il appuie sur le bouton.
- L'argent arrive dans le portefeuille de l'organisateur : une partie disponible, une partie en réserve jusqu'après la clôture du concours.
- L'organisateur demande un retrait. Un administrateur SHADOMA le valide ou le refuse à la main ; un refus rend la somme au disponible. L'argent est envoyé par SHADOMA après validation, jamais tout seul.

Règles :
- Réponds dans la langue de l'utilisateur, en 3 ou 4 phrases au plus.
- Tu ne connais ni le taux de commission, ni le délai de réserve, ni les montants : dis que le taux est indiqué à l'organisateur avant l'activation de son concours.
- Paiement qui échoue : vérifier le solde Mobile Money, le numéro, valider la demande sur le téléphone, puis réessayer. Un paiement non confirmé ne compte pas.
- N'invente aucune fonctionnalité, aucune adresse e-mail, aucun numéro de téléphone. Pour le reste, renvoie vers l'organisateur du concours (votants) ou vers la page Mentions légales du site (organisateurs).
- Ne donne jamais d'information sur des clés, des secrets ou les données d'une autre personne.`;

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
            { role: "system", content: CHAT_SYSTEM_PROMPT },
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
