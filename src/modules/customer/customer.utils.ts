import { randomInt } from "node:crypto";
import prisma from "../../db/db.config.js";

export const generateCustomerSid =
  async (): Promise<string> => {
    for (
      let attempt = 0;
      attempt < 10;
      attempt++
    ) {
      const sid = randomInt(
        100000,
        1000000
      ).toString();

      const existing =
        await prisma.customer.findUnique({
          where: {
            sid,
          },
          select: {
            id: true,
          },
        });

      if (!existing) {
        return sid;
      }
    }

    throw new Error(
      "CUSTOMER_SID_GENERATION_FAILED"
    );
  };