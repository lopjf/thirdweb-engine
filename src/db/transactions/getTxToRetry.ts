import { Transactions } from "@prisma/client";
import type { PrismaTransaction } from "../../schema/prisma";
import { getConfig } from "../../utils/cache/getConfig";
import { getPrismaWithPostgresTx } from "../client";

interface GetTxToRetryParams {
  pgtx?: PrismaTransaction;
}

export const getTxToRetry = async ({ pgtx }: GetTxToRetryParams = {}): Promise<
  Transactions | undefined
> => {
  const prisma = getPrismaWithPostgresTx(pgtx);
  const config = await getConfig();

  // TODO: Remove transactionHash
  // TODO: For now, we're not retrying user ops
  const [tx] = (await prisma.$queryRaw`
SELECT
  *
FROM
  "transactions"
WHERE
  "processedAt" IS NOT NULL
  AND "sentAt" IS NOT NULL
  AND "accountAddress" IS NULL
  AND "minedAt" IS NULL
  AND "errorMessage" IS NULL
  AND "transactionHash" IS NOT NULL
  AND "retryCount" < ${config.maxRetriesPerTx}
ORDER BY
  "nonce"
ASC
LIMIT
  1
FOR UPDATE SKIP LOCKED
  `) as Transactions[];

  return tx;
};
