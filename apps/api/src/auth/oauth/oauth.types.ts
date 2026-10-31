// Seul Google est proposé : Facebook ne garantit pas que l'e-mail est vérifié.
export type OAuthProvider = "google";

export type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
};
