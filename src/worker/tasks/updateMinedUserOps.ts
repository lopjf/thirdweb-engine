import { getBlock } from "@thirdweb-dev/sdk";
import { ERC4337EthersSigner } from "@thirdweb-dev/wallets/dist/declarations/src/evm/connectors/smart-wallet/lib/erc4337-signer";
import { prisma } from "../../db/client";
import { getSentUserOps } from "../../db/transactions/getSentUserOps";
import { updateTx } from "../../db/transactions/updateTx";
import { TransactionStatusEnum } from "../../server/schemas/transaction";
import { getSdk } from "../../utils/cache/getSdk";
import { logger } from "../../utils/logger";
import {
  ReportUsageParams,
  UsageEventTxActionEnum,
  reportUsage,
} from "../../utils/usage";
import { WebhookData, sendWebhooks } from "../../utils/webhook";

export const updateMinedUserOps = async () => {
  try {
    const sendWebhookForQueueIds: WebhookData[] = [];
    const reportUsageForQueueIds: ReportUsageParams[] = [];
    await prisma.$transaction(
      async (pgtx) => {
        const userOps = await getSentUserOps({ pgtx });

        if (userOps.length === 0) {
          return;
        }

        // TODO: Improve spaghetti code...
        const updatedUserOps = (
          await Promise.all(
            userOps.map(async (userOp) => {
              const sdk = await getSdk({
                chainId: parseInt(userOp.chainId!),
                walletAddress: userOp.signerAddress!,
                accountAddress: userOp.accountAddress!,
              });

              const signer = sdk.getSigner() as ERC4337EthersSigner;

              const txHash = await signer.smartAccountAPI.getUserOpReceipt(
                userOp.userOpHash!,
                3000,
              );

              if (!txHash) {
                // If no receipt was received, return undefined to filter out tx
                return undefined;
              }
              const _sdk = await getSdk({
                chainId: parseInt(userOp.chainId!),
              });

              const tx = await signer.provider!.getTransaction(txHash);
              const txReceipt = await _sdk
                .getProvider()
                .getTransactionReceipt(txHash);
              const minedAt = new Date(
                (
                  await getBlock({
                    block: tx.blockNumber!,
                    network: sdk.getProvider(),
                  })
                ).timestamp * 1000,
              );

              return {
                ...userOp,
                blockNumber: tx.blockNumber!,
                minedAt,
                onChainTxStatus: txReceipt.status,
                transactionHash: txHash,
                transactionType: tx.type,
                gasLimit: tx.gasLimit.toString(),
                maxFeePerGas: tx.maxFeePerGas?.toString(),
                maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString(),
                provider: signer.httpRpcClient.bundlerUrl,
              };
            }),
          )
        ).filter((userOp) => !!userOp);

        await Promise.all(
          updatedUserOps.map(async (userOp) => {
            await updateTx({
              pgtx,
              queueId: userOp!.id,
              data: {
                status: TransactionStatusEnum.Mined,
                minedAt: userOp!.minedAt,
                blockNumber: userOp!.blockNumber,
                onChainTxStatus: userOp!.onChainTxStatus,
                transactionHash: userOp!.transactionHash,
                transactionType: userOp!.transactionType || undefined,
                gasLimit: userOp!.gasLimit || undefined,
                maxFeePerGas: userOp!.maxFeePerGas || undefined,
                maxPriorityFeePerGas: userOp!.maxPriorityFeePerGas || undefined,
                gasPrice: userOp!.gasPrice || undefined,
              },
            });

            logger({
              service: "worker",
              level: "info",
              queueId: userOp!.id,
              message: `Updated with receipt`,
            });
            sendWebhookForQueueIds.push({
              queueId: userOp!.id,
              status: TransactionStatusEnum.Mined,
            });
            reportUsageForQueueIds.push({
              input: {
                fromAddress: userOp!.fromAddress || undefined,
                toAddress: userOp!.toAddress || undefined,
                value: userOp!.value || undefined,
                chainId: userOp!.chainId || undefined,
                userOpHash: userOp!.userOpHash || undefined,
                onChainTxStatus: userOp!.onChainTxStatus,
                functionName: userOp!.functionName || undefined,
                extension: userOp!.extension || undefined,
                provider: userOp!.provider || undefined,
                msSinceSend:
                  userOp!.minedAt.getTime() - userOp!.sentAt!.getTime(),
              },
              action: UsageEventTxActionEnum.MineTx,
            });
          }),
        );
      },
      {
        timeout: 5 * 60000,
      },
    );

    await sendWebhooks(sendWebhookForQueueIds);
    reportUsage(reportUsageForQueueIds);
  } catch (err) {
    logger({
      service: "worker",
      level: "error",
      message: `Failed to update receipts`,
      error: err,
    });
    return;
  }
};
