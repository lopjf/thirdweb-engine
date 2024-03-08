import { Static, Type } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";
import { StatusCodes } from "http-status-codes";
import { queueTx } from "../../../../../../db/transactions/queueTx";
import { getContract } from "../../../../../../utils/cache/getContract";
import {
  contractParamSchema,
  requestQuerystringSchema,
  standardResponseSchema,
  transactionWritesResponseSchema,
} from "../../../../../schemas/sharedApiSchemas";
import { walletAuthSchema } from "../../../../../schemas/wallet";
import { getChainIdFromChain } from "../../../../../utils/chain";

const BodySchema = Type.Object({
  walletAddress: Type.String({
    description: "Address to revoke session from",
  }),
});

BodySchema.examples = [
  {
    walletAddress: "0x3ecdbf3b911d0e9052b64850693888b008e18373",
  },
];

export const revokeSession = async (fastify: FastifyInstance) => {
  fastify.route<{
    Params: Static<typeof contractParamSchema>;
    Reply: Static<typeof transactionWritesResponseSchema>;
    Body: Static<typeof BodySchema>;
    Querystring: Static<typeof requestQuerystringSchema>;
  }>({
    method: "POST",
    url: "/contract/:chain/:contractAddress/account/sessions/revoke",
    schema: {
      summary: "Revoke session key",
      description: "Revoke a session key for a smart account.",
      tags: ["Account"],
      operationId: "revokeSession",
      params: contractParamSchema,
      headers: walletAuthSchema,
      body: BodySchema,
      querystring: requestQuerystringSchema,
      response: {
        ...standardResponseSchema,
        [StatusCodes.OK]: transactionWritesResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const { chain, contractAddress } = request.params;
      const { simulateTx } = request.query;
      const { walletAddress } = request.body;
      const backendWalletAddress = request.headers[
        "x-backend-wallet-address"
      ] as string;
      const accountAddress = request.headers["x-account-address"] as string;
      const chainId = await getChainIdFromChain(chain);

      const contract = await getContract({
        chainId,
        contractAddress,
        walletAddress: backendWalletAddress,
        accountAddress,
      });
      const tx = await contract.account.revokeAccess.prepare(walletAddress);
      const queueId = await queueTx({
        tx,
        chainId,
        simulateTx,
        extension: "account",
      });

      reply.status(StatusCodes.OK).send({
        result: {
          queueId,
        },
      });
    },
  });
};
