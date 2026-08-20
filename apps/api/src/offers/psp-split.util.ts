import { PaymentProvider } from "@prisma/client";
import {
  PSP_FEDAPAY_SUPPORTS_SPLIT_KEY,
  PSP_FEEXPAY_SUPPORTS_SPLIT_KEY,
  PSP_KKIAPAY_SUPPORTS_SPLIT_KEY,
  parseBoolSetting
} from "../common/platform-settings";

const DEFAULT_SUPPORTS_SPLIT: Record<PaymentProvider, boolean> = {
  [PaymentProvider.FEEXPAY]: false,
  [PaymentProvider.FEDAPAY]: true,
  [PaymentProvider.KKIAPAY]: false
};

const SPLIT_SETTING_KEY: Record<PaymentProvider, string> = {
  [PaymentProvider.FEEXPAY]: PSP_FEEXPAY_SUPPORTS_SPLIT_KEY,
  [PaymentProvider.FEDAPAY]: PSP_FEDAPAY_SUPPORTS_SPLIT_KEY,
  [PaymentProvider.KKIAPAY]: PSP_KKIAPAY_SUPPORTS_SPLIT_KEY
};

type SettingReader = {
  platformSetting: {
    findUnique: (args: { where: { key: string } }) => Promise<{ value: string } | null>;
  };
};

/**
 * Whether a PSP is flagged as supporting split/settlement for Offer 1 (EXTERNAL).
 * Defaults follow verified public capabilities: FedaPay Marketplace true,
 * FeexPay/KkiaPay false. Admin may disable FedaPay, but unsupported providers
 * must not be enabled without a verified contractual API.
 */
export async function supportsSplit(
  db: SettingReader,
  provider: PaymentProvider
): Promise<boolean> {
  const key = SPLIT_SETTING_KEY[provider];
  const row = await db.platformSetting.findUnique({ where: { key } });
  return parseBoolSetting(row?.value, DEFAULT_SUPPORTS_SPLIT[provider]);
}
