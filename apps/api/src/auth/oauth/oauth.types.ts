export type OAuthProvider = "google" | "facebook";

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
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
};

export type FacebookUserInfo = {
  id: string;
  name: string;
  email: string;
  picture: { data: { url: string } };
};
