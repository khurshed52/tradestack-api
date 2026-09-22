import type { Request, Response } from "express";
import prisma from "../db/db.config.js";

export const getMyProfile = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        customer: {
          select: {
            id: true,
            customerFirstName: true,
            customerLastName: true,
            customerNationality: true,
            phoneNumber: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "User not found",
        data: null,
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Profile fetched successfully",
      data: user,
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};