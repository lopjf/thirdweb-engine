import { Static } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";
import { StatusCodes } from "http-status-codes";
import { queueTx } from "../../../../../db/transactions/queueTx";
import { getContract } from "../../../../../utils/cache/getContract";
import { RoyaltySchema } from "../../../../schemas/contract";
import {
  contractParamSchema,
  requestQuerystringSchema,
  standardResponseSchema,
  transactionWritesResponseSchema,
} from "../../../../schemas/sharedApiSchemas";
import { walletAuthSchema } from "../../../../schemas/wallet";
import { getChainIdFromChain } from "../../../../utils/chain";

// INPUTS
const requestSchema = contractParamSchema;
const requestBodySchema = RoyaltySchema;

requestBodySchema.examples = [
  {
    fee_recipient: "0x1946267d81Fb8aDeeEa28e6B98bcD446c8248473",
    seller_fee_basis_points: 100,
  },
];

// OUTPUT
const responseSchema = transactionWritesResponseSchema;

export async function setDefaultRoyaltyInfo(fastify: FastifyInstance) {
  fastify.route<{
    Params: Static<typeof requestSchema>;
    Reply: Static<typeof responseSchema>;
    Body: Static<typeof requestBodySchema>;
    Querystring: Static<typeof requestQuerystringSchema>;
  }>({
    method: "POST",
    url: "/contract/:chain/:contractAddress/royalties/set-default-royalty-info",
    schema: {
      summary: "Set royalty details",
      description: "Set the royalty recipient and fee for the smart contract.",
      tags: ["Contract-Royalties"],
      operationId: "setDefaultRoyaltyInfo",
      headers: walletAuthSchema,
      params: requestSchema,
      body: requestBodySchema,
      querystring: requestQuerystringSchema,
      response: {
        ...standardResponseSchema,
        [StatusCodes.OK]: responseSchema,
      },
    },
    handler: async (request, reply) => {
      const { chain, contractAddress } = request.params;
      const { simulateTx } = request.query;
      const { seller_fee_basis_points, fee_recipient } = request.body;
      const walletAddress = request.headers[
        "x-backend-wallet-address"
      ] as string;
      const accountAddress = request.headers["x-account-address"] as string;
      const chainId = await getChainIdFromChain(chain);
      const contract = await getContract({
        chainId,
        contractAddress,
        walletAddress,
        accountAddress,
      });

      const tx = await contract.royalties.setDefaultRoyaltyInfo.prepare({
        seller_fee_basis_points,
        fee_recipient,
      });
      const queueId = await queueTx({
        tx,
        chainId,
        simulateTx,
        extension: "none",
      });
      reply.status(StatusCodes.OK).send({
        result: {
          queueId,
        },
      });
    },
  });
}
