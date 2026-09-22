import type { Request, Response } from "express";

export const getIpInfo = async (
  req: Request,
  res: Response
) => {
  try {
    // Get visitor IP
    const forwardedFor = req.headers["x-forwarded-for"];

    let ip: string | undefined;

    if (typeof forwardedFor === "string") {
      ip = forwardedFor.split(",")[0]?.trim();
    }

    if (!ip) {
      ip = req.ip;
    }

    // Remove IPv6-mapped IPv4 prefix
    if (ip?.startsWith("::ffff:")) {
      ip = ip.substring(7);
    }

    // localhost cannot be geolocated
    const isLocalhost =
      !ip ||
      ip === "::1" ||
      ip === "127.0.0.1";

    const url = !ip || isLocalhost
      ? "https://ipwho.is/"
      : `https://ipwho.is/${encodeURIComponent(ip)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `IP API returned ${response.status}`
      );
    }

    const result = await response.json() as {
      success?: boolean;
      message?: string;
      ip?: string;
      country?: string;
      country_code?: string;
      region?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
      timezone?: {
        id?: string;
      };
    };

    if (result.success === false) {
      return res.status(400).json({
        statusCode: 400,
        message:
          result.message ??
          "Unable to fetch IP information",
        data: null,
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message:
        "IP information fetched successfully",
      data: {
        ip: result.ip ?? null,
        country: result.country ?? null,
        countryCode:
          result.country_code ?? null,
        region: result.region ?? null,
        city: result.city ?? null,
        latitude: result.latitude ?? null,
        longitude: result.longitude ?? null,
        timezone:
          result.timezone?.id ?? null,
      },
    });
  } catch (error) {
    console.error("Get IP info error:", error);

    return res.status(500).json({
      statusCode: 500,
      message:
        "Unable to fetch IP information",
      data: null,
    });
  }
};
