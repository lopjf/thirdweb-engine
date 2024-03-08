import { Static } from "@sinclair/typebox";
import { getChainByChainIdAsync } from "@thirdweb-dev/chains";
import { Chain, LocalWallet } from "@thirdweb-dev/wallets";
import { getWalletDetails } from "../../../db/wallets/getWalletDetails";
import { getConfig } from "../../../utils/cache/getConfig";
import { networkResponseSchema } from "../../../utils/cache/getSdk";
import { env } from "../../../utils/env";
import { logger } from "../../../utils/logger";
import { LocalFileStorage } from "../storage/localStorage";

interface GetLocalWalletParams {
  chainId: number;
  walletAddress: string;
}

export const getLocalWallet = async ({
  chainId,
  walletAddress,
}: GetLocalWalletParams) => {
  let chain: Chain | undefined = undefined;
  const config = await getConfig();
  const CHAIN_OVERRIDES = config.chainOverrides;
  try {
    chain = await getChainByChainIdAsync(chainId);
  } catch (error) {}

  if (CHAIN_OVERRIDES) {
    const parsedChainOverrides = JSON.parse(CHAIN_OVERRIDES);
    const overrideChain = parsedChainOverrides.find(
      (chainData: Static<typeof networkResponseSchema>) =>
        chainData.chainId === chainId,
    );

    if (overrideChain) {
      chain = overrideChain;
    }
  }

  if (!chain) {
    throw new Error(
      `Invalid chain ${chainId}, please use a different value or provide Chain Override Data.`,
    );
  }

  const wallet = new LocalWallet({ chain });

  // TODO: Remove this with next breaking change
  try {
    // First, try to load the wallet using the encryption password
    await wallet.load({
      strategy: "encryptedJson",
      password: env.ENCRYPTION_PASSWORD,
      storage: new LocalFileStorage(walletAddress),
    });
  } catch {
    // If that fails, try the thirdweb api secret key for backwards compatibility
    await wallet.load({
      strategy: "encryptedJson",
      password: env.THIRDWEB_API_SECRET_KEY,
      storage: new LocalFileStorage(walletAddress),
    });

    // If that works, save the wallet using the encryption password for the future
    const walletDetails = await getWalletDetails({ address: walletAddress });
    if (!walletDetails) {
      throw new Error(
        `Wallet details not found for wallet address ${walletAddress}`,
      );
    }

    logger({
      service: "worker",
      level: "info",
      message: `[Encryption] Updating local wallet ${walletAddress} to use ENCRYPTION_PASSWORD`,
    });

    await wallet.save({
      strategy: "encryptedJson",
      password: env.ENCRYPTION_PASSWORD,
      storage: new LocalFileStorage(
        walletAddress,
        walletDetails.label ?? undefined,
      ),
    });
  }

  return wallet;
};
