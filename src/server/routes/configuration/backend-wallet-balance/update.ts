import { Static, Type } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";
import { StatusCodes } from "http-status-codes";
import { updateConfiguration } from "../../../../db/configuration/updateConfiguration";
import { getConfig } from "../../../../utils/cache/getConfig";
import { standardResponseSchema } from "../../../schemas/sharedApiSchemas";
import { ReplySchema } from "./get";

const BodySchema = Type.Partial(
  Type.Object({
    minWalletBalance: Type.String({
      description: "Minimum wallet balance in wei",
    }),
  }),
);

export async function updateBackendWalletBalanceConfiguration(
  fastify: FastifyInstance,
) {
  fastify.route<{
    Body: Static<typeof BodySchema>;
  }>({
    method: "POST",
    url: "/configuration/backend-wallet-balance",
    schema: {
      summary: "Update backend wallet balance configuration",
      description: "Update backend wallet balance configuration",
      tags: ["Configuration"],
      operationId: "updateBackendWalletBalanceConfiguration",
      body: BodySchema,
      response: {
        ...standardResponseSchema,
        [StatusCodes.OK]: ReplySchema,
      },
    },
    handler: async (req, res) => {
      await updateConfiguration({ ...req.body });
      const config = await getConfig(false);

      res.status(200).send({
        result: {
          minWalletBalance: config.minWalletBalance,
        },
      });
    },
  });
}
