// Libellés lisibles pour l'espace admin : aucun nom de rôle, d'action ou
// d'identifiant technique ne doit apparaître tel quel à l'écran.

type Pair = readonly [fr: string, en: string];

const ROLES: Record<string, Pair> = {
  PLATFORM_SUPER_ADMIN: ["Super-admin plateforme", "Platform super admin"],
  PLATFORM_ADMIN: ["Admin plateforme", "Platform admin"],
  ORGANIZER_OWNER: ["Organisateur", "Organizer"],
  ORGANIZER_STAFF: ["Membre d'équipe", "Team member"]
};

export function roleLabel(role: string, isEn: boolean): string {
  const pair = ROLES[role];
  if (!pair) return isEn ? "Other role" : "Autre rôle";
  return isEn ? pair[1] : pair[0];
}

const ACTIONS: Record<string, Pair> = {
  "admin.added": ["Administrateur ajouté", "Admin added"],
  "admin.email_updated": ["E-mail admin modifié", "Admin email changed"],
  "admin.password_updated": ["Mot de passe admin modifié", "Admin password changed"],
  "api_key.created": ["Clé API créée", "API key created"],
  "api_key.revoked": ["Clé API révoquée", "API key revoked"],
  "auth.login": ["Connexion", "Sign-in"],
  "auth.login_failed": ["Connexion échouée", "Failed sign-in"],
  "auth.otp_verified": ["Code de vérification validé", "Verification code accepted"],
  "auth.refresh_token_reuse_detected": ["Session suspecte bloquée", "Suspicious session blocked"],
  "candidate.created": ["Candidat ajouté", "Candidate added"],
  "candidate.deleted": ["Candidat supprimé", "Candidate deleted"],
  "candidates.imported": ["Candidats importés", "Candidates imported"],
  "candidate.vote_count_adjusted": ["Compteur de votes corrigé", "Vote count adjusted"],
  "commission.override_event": ["Commission d'événement modifiée", "Event commission changed"],
  "commission.override_tenant": ["Commission d'organisateur modifiée", "Organizer commission changed"],
  "commission.tenant_rate_set": ["Taux négocié enregistré", "Negotiated rate saved"],
  "contract.downloaded_by_admin": ["Contrat téléchargé par un admin", "Contract downloaded by an admin"],
  "contract.generated": ["Contrat généré", "Contract generated"],
  "contract.signed": ["Contrat signé, concours publié", "Contract signed, contest published"],
  "display_partner.created": ["Partenaire affiché ajouté", "Featured partner added"],
  "display_partner.deleted": ["Partenaire affiché retiré", "Featured partner removed"],
  "display_partner.updated": ["Partenaire affiché modifié", "Featured partner updated"],
  "event.archived": ["Événement archivé", "Event archived"],
  "event.closed": ["Événement clôturé", "Event closed"],
  "event.created": ["Événement créé", "Event created"],
  "event.deleted": ["Événement supprimé", "Event deleted"],
  "event.quick_started": ["Événement lancé en un clic", "Event quick-started"],
  "event.updated": ["Événement modifié", "Event updated"],
  "invitation.accepted": ["Invitation acceptée", "Invitation accepted"],
  "maintenance.purge_executed": ["Nettoyage effectué", "Clean-up run"],
  "payment.abandoned_pending": ["Paiement abandonné (sans réponse à temps)", "Payment abandoned (no answer in time)"],
  "payment.expired_orphan": ["Paiement expiré", "Payment expired"],
  "payment.late_success_recovered": ["Paiement tardif honoré", "Late payment honoured"],
  "payment.late_success_needs_refund": ["Paiement tardif à rembourser", "Late payment to refund"],
  "payment.initiated": ["Paiement lancé", "Payment started"],
  "payment.verified_applied": ["Paiement confirmé", "Payment confirmed"],
  "payment.verified_failed": ["Paiement échoué", "Payment failed"],
  "payment.verify_rejected": ["Vérification de paiement refusée", "Payment check rejected"],
  "vote.cancelled": ["Vote annulé", "Vote cancelled"],
  "platform.finance_settings_updated": ["Règles d'argent modifiées", "Money rules changed"],
  "privacy.user_data_deleted": ["Données personnelles effacées", "Personal data erased"],
  "user.deleted": ["Utilisateur supprimé", "User deleted"],
  "user.provider_updated": ["Mode de connexion modifié", "Sign-in method changed"],
  "withdrawal.approved": ["Retrait approuvé", "Withdrawal approved"],
  "withdrawal.destination_revealed": ["Numéro de retrait consulté", "Withdrawal number viewed"],
  "withdrawal.marked_paid": ["Retrait marqué payé", "Withdrawal marked paid"],
  "withdrawal.rejected": ["Retrait refusé", "Withdrawal rejected"],
  "withdrawal.requested": ["Retrait demandé", "Withdrawal requested"]
};

/** Liste des actions connues, pour proposer un choix au lieu d'une saisie libre. */
export const AUDIT_ACTIONS = Object.keys(ACTIONS);

export function auditActionLabel(action: string, isEn: boolean): string {
  const pair = ACTIONS[action];
  if (pair) return isEn ? pair[1] : pair[0];
  // Action inconnue : « domaine.verbe_complement » → « Domaine · verbe complement ».
  const [domain = "", ...rest] = action.split(".");
  const head = domain.replace(/_/g, " ");
  const tail = rest.join(" ").replace(/_/g, " ");
  const cap = head.charAt(0).toUpperCase() + head.slice(1);
  return tail ? `${cap} · ${tail}` : cap;
}

const TARGETS: Record<string, Pair> = {
  Account: ["Compte", "Account"],
  AdminApiKey: ["Clé API", "API key"],
  AuthOtpChallenge: ["Code de vérification", "Verification code"],
  AuthSession: ["Session", "Session"],
  Candidate: ["Candidat", "Candidate"],
  DisplayPartner: ["Partenaire affiché", "Featured partner"],
  Event: ["Événement", "Event"],
  EventContract: ["Contrat de concours", "Contest contract"],
  Invitation: ["Invitation", "Invitation"],
  Maintenance: ["Maintenance", "Maintenance"],
  PaymentTransaction: ["Paiement", "Payment"],
  Tenant: ["Organisateur", "Organizer"],
  User: ["Utilisateur", "User"],
  WithdrawalRequest: ["Demande de retrait", "Withdrawal request"]
};

export const AUDIT_TARGET_TYPES = Object.keys(TARGETS);

export function targetTypeLabel(type: string, isEn: boolean): string {
  const pair = TARGETS[type];
  if (!pair) return type;
  return isEn ? pair[1] : pair[0];
}

/** Référence courte d'un identifiant (6 derniers caractères), pour l'œil humain. */
export function shortRef(id: string | null | undefined): string {
  if (!id) return "";
  return `#${id.slice(-6).toUpperCase()}`;
}
