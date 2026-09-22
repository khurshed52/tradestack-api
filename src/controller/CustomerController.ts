import prisma from "../db/db.config.js";
import type { Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { normalizeEmail } from "../utils/normalizeEmail.js";

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );

/**
 * CREATE CUSTOMER
 *
 * Customers are now created automatically during registration.
 * We don't create standalone customers here because every Customer
 * must be linked to a User through userId.
 */
export const createCustomer = async (
  req: Request,
  res: Response
) => {
  return res.status(405).json({
    statusCode: 405,
    message:
      "Customers are created automatically during user registration",
    data: null,
  });
};

/**
 * GET ALL CUSTOMERS
 */
export const getAllCustomer = async (
  req: Request,
  res: Response
) => {
  try {
    const body = req.body ?? {};

    const {
      page = 1,
      pageSize = 10,
      filters = {},
    } = body;

    // Validate pagination
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      !Number.isSafeInteger((page - 1) * pageSize)
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "page must be a positive integer and pageSize must be between 1 and 100",
        data: null,
      });
    }

    // Validate filters object
    if (
      !filters ||
      typeof filters !== "object" ||
      Array.isArray(filters)
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "filters must be an object",
        data: null,
      });
    }

    const allowedFilters = [
      "customerFirstName",
      "customerLastName",
      "email",
      "customerNationality",
      "phoneNumber",
    ] as const;

    // Reject unsupported filters
    if (
      Object.keys(filters).some(
        (key) =>
          !allowedFilters.includes(
            key as (typeof allowedFilters)[number]
          ) ||
          typeof filters[key] !== "string"
      )
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Supported filters are customerFirstName, customerLastName, email, customerNationality, and phoneNumber",
        data: null,
      });
    }

    const where: Prisma.CustomerWhereInput = {
      isActive: true,
    };

    // Build filters
    for (const field of allowedFilters) {
      const value = filters[field]?.trim();

      if (value) {
        where[field] = {
          contains: value,
          mode: "insensitive",
        };
      }
    }

    // Fetch count + paginated customers
    const [dataCount, pageData] =
      await prisma.$transaction(
        [
          prisma.customer.count({
            where,
          }),

          prisma.customer.findMany({
            where,
            skip: (page - 1) * pageSize,
            take: pageSize,

            orderBy: [
              {
                createdAt: "desc",
              },
              {
                id: "asc",
              },
            ],

            select: {
              id: true,
              userId: true,
              customerFirstName: true,
              customerLastName: true,
              email: true,
              customerNationality: true,
              phoneNumber: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
        ],
        {
          isolationLevel: "RepeatableRead",
        }
      );

    return res.status(200).json({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        page,
        pageSize,
        dataCount,
        pageCount: Math.ceil(
          dataCount / pageSize
        ),
        pageData,
      },
    });
  } catch (error) {
    console.error(
      "Get all customers error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

/**
 * GET CUSTOMER DETAILS
 */
export const getCustomerDetails = async (
  req: Request,
  res: Response
) => {
  try {
    const customerId = req.body?.id;

    if (!isUuid(customerId)) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "A valid customer UUID is required",
        data: null,
      });
    }

    const customer =
      await prisma.customer.findFirst({
        where: {
          id: customerId,
          isActive: true,
        },

        select: {
          id: true,
          userId: true,
          customerFirstName: true,
          customerLastName: true,
          email: true,
          customerNationality: true,
          phoneNumber: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    if (!customer) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }

    // Ownership comes from the stored relationship, never request data.
    if (
      req.user?.role !== "ADMIN" &&
      !(req.user?.role === "USER" && customer.userId === req.user.id)
    ) {
      return res.status(403).json({
        statusCode: 403,
        message: "You are not authorized to access this customer",
        data: null,
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message:
        "Customer fetched successfully",
      data: customer,
    });
  } catch (error) {
    console.error(
      "Get customer details error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

/**
 * DELETE CUSTOMER
 *
 * Soft delete only.
 */
export const deleteCustomer = async (
  req: Request,
  res: Response
) => {
  try {
    const customerId = req.body?.id;

    if (!isUuid(customerId)) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "A valid customer UUID is required",
        data: null,
      });
    }

    const result =
      await prisma.customer.updateMany({
        where: {
          id: customerId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

    if (result.count === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message:
        "Customer deleted successfully",
      data: null,
    });
  } catch (error) {
    console.error(
      "Delete customer error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

/**
 * UPDATE CUSTOMER
 */
export const updateCustomer = async (
  req: Request,
  res: Response
) => {
  try {
    const body = req.body ?? {};
    const { id } = body;

    if (!isUuid(id)) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "A valid customer UUID is required",
        data: null,
      });
    }

    const fields = [
      "customerFirstName",
      "customerLastName",
      "email",
      "customerNationality",
      "phoneNumber",
    ] as const;

    // Prevent unsupported fields from being updated
    if (
      Object.keys(body).some(
        (key) =>
          key !== "id" &&
          !fields.includes(
            key as (typeof fields)[number]
          )
      )
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Only customerFirstName, customerLastName, email, customerNationality, and phoneNumber can be updated",
        data: null,
      });
    }

    const data: Partial<
      Record<(typeof fields)[number], string>
    > = {};

    // Validate update values
    for (const field of fields) {
      if (Object.hasOwn(body, field)) {
        if (
          typeof body[field] !== "string" ||
          !body[field].trim()
        ) {
          return res.status(400).json({
            statusCode: 400,
            message: `${field} must be a non-empty string`,
            data: null,
          });
        }

        data[field] = body[field].trim();
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Provide at least one field to update",
        data: null,
      });
    }

    // Normalize email if it is being updated
    if (data.email) {
      data.email = normalizeEmail(data.email);
    }

    // Check customer exists
    const customer =
      await prisma.customer.findFirst({
        where: {
          id,
          isActive: true,
        },
        select: {
          id: true,
          userId: true,
          email: true,
        },
      });

    if (!customer) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }

    // Ownership comes from the stored relationship, never request data.
    if (
      req.user?.role !== "ADMIN" &&
      !(req.user?.role === "USER" && customer.userId === req.user.id)
    ) {
      return res.status(403).json({
        statusCode: 403,
        message: "You are not authorized to access this customer",
        data: null,
      });
    }

    // Check duplicate email / phone
    const [emailExists, phoneExists, userEmailExists] =
      await Promise.all([
        data.email
          ? prisma.customer.findFirst({
              where: {
                email: data.email,
                id: {
                  not: id,
                },
              },
              select: {
                id: true,
              },
            })
          : null,

        data.phoneNumber
          ? prisma.customer.findFirst({
              where: {
                phoneNumber:
                  data.phoneNumber,
                id: {
                  not: id,
                },
              },
              select: {
                id: true,
              },
            })
          : null,
        data.email
          ? prisma.user.findFirst({
              where: {
                email: data.email,
                id: { not: customer.userId },
              },
              select: { id: true },
            })
          : null,
      ]);

    if (emailExists || userEmailExists) {
      return res.status(409).json({
        statusCode: 409,
        message: "Email already exists",
        data: null,
      });
    }

    if (phoneExists) {
      return res.status(409).json({
        statusCode: 409,
        message:
          "Customer already exists",
        data: {
          ...(phoneExists && {
            phoneNumber:
              "Phone number already exists",
          }),
        },
      });
    }

    try {
      const updateArgs = {
          where: {
            id,
          },

          data,

          select: {
            id: true,
            userId: true,
            customerFirstName: true,
            customerLastName: true,
            email: true,
            customerNationality: true,
            phoneNumber: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        } satisfies Prisma.CustomerUpdateArgs;

      const updatedCustomer = data.email
        ? await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: customer.userId },
              data: { email: data.email },
            });
            return tx.customer.update(updateArgs);
          })
        : await prisma.customer.update(updateArgs);

      return res.status(200).json({
        statusCode: 200,
        message:
          "Customer updated successfully",
        data: updatedCustomer,
      });
    } catch (error) {
      if (
        error instanceof
        Prisma.PrismaClientKnownRequestError
      ) {
        if (error.code === "P2025") {
          return res.status(404).json({
            statusCode: 404,
            message:
              "Customer not found",
            data: null,
          });
        }

        if (error.code === "P2002") {
          return res.status(409).json({
            statusCode: 409,
            message:
              "Email or phone number already exists",
            data: null,
          });
        }
      }

      throw error;
    }
  } catch (error) {
    console.error(
      "Update customer error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};