import { Static, Type } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";
import { StatusCodes } from "http-status-codes";
import { queueTx } from "../../../../db/transactions/queueTx";
import { getSdk } from "../../../../utils/cache/getSdk";
import {
  commonContractSchema,
  commonPlatformFeeSchema,
  commonPrimarySaleSchema,
  commonRoyaltySchema,
  commonSymbolSchema,
  commonTrustedForwarderSchema,
  prebuiltDeployContractParamSchema,
  prebuiltDeployResponseSchema,
} from "../../../schemas/prebuilts/index";
import { standardResponseSchema } from "../../../schemas/sharedApiSchemas";
import { walletAuthSchema } from "../../../schemas/wallet";
import { txOverridesForWriteRequest } from "../../../schemas/web3api-overrides";
import { getChainIdFromChain } from "../../../utils/chain";

// INPUTS
const requestSchema = prebuiltDeployContractParamSchema;
const requestBodySchema = Type.Object({
  contractMetadata: Type.Object({
    ...commonContractSchema.properties,
    ...commonRoyaltySchema.properties,
    ...commonSymbolSchema.properties,
    ...commonPlatformFeeSchema.properties,
    ...commonPrimarySaleSchema.properties,
    ...commonTrustedForwarderSchema.properties,
  }),
  version: Type.Optional(
    Type.String({
      description: "Version of the contract to deploy. Defaults to latest.",
    }),
  ),
  ...txOverridesForWriteRequest.properties,
});

// Example for the Request Body

requestBodySchema.examples = [
  {
    contractMetadata: {
      name: "My Edition",
      symbol: "ED",
      primary_sale_recipient: "<your-wallet-address>",
    },
  },
];

// OUTPUT
const responseSchema = prebuiltDeployResponseSchema;

export async function deployPrebuiltEdition(fastify: FastifyInstance) {
  fastify.route<{
    Params: Static<typeof requestSchema>;
    Reply: Static<typeof responseSchema>;
    Body: Static<typeof requestBodySchema>;
  }>({
    method: "POST",
    url: "/deploy/:chain/prebuilts/edition",
    schema: {
      summary: "Deploy Edition",
      description: "Deploy an Edition contract.",
      tags: ["Deploy"],
      operationId: "deployEdition",
      params: requestSchema,
      body: requestBodySchema,
      headers: walletAuthSchema,
      response: {
        ...standardResponseSchema,
        [StatusCodes.OK]: responseSchema,
      },
    },
    handler: async (request, reply) => {
      const { chain } = request.params;
      const { contractMetadata, version } = request.body;
      const chainId = await getChainIdFromChain(chain);
      const walletAddress = request.headers[
        "x-backend-wallet-address"
      ] as string;
      const accountAddress = request.headers["x-account-address"] as string;

      const sdk = await getSdk({ chainId, walletAddress, accountAddress });

      const tx = await sdk.deployer.deployBuiltInContract.prepare(
        "edition",
        contractMetadata,
        version,
      );
      const deployedAddress = await tx.simulate();
      const queueId = await queueTx({
        tx,
        chainId,
        extension: "deploy-prebuilt",
        deployedContractAddress: deployedAddress,
        deployedContractType: "edition",
      });
      reply.status(StatusCodes.OK).send({
        result: {
          deployedAddress,
          queueId,
        },
      });
    },
  });
}
