type CreateVeriffSessionInput = {
  customerId: string;
  firstName: string;
  lastName: string;
};

type VeriffSessionResponse = {
  status: string;
  verification: {
    id: string;
    url: string;
    vendorData?: string | null;
    status?: string;
    sessionToken?: string;
  };
};

export const createVeriffSession = async ({
  customerId,
  firstName,
  lastName,
}: CreateVeriffSessionInput) => {
  const baseUrl = process.env.VERIFF_BASE_URL;
  const apiKey = process.env.VERIFF_API_KEY;

  if (!baseUrl) {
    throw new Error("VERIFF_BASE_URL is required");
  }

  if (!apiKey) {
    throw new Error("VERIFF_API_KEY is required");
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/v1/sessions`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "X-AUTH-CLIENT": apiKey,
      },

      body: JSON.stringify({
        verification: {
          person: {
            firstName,
            lastName,
          },

          // Our internal reference.
          // Don't put email, name or other PII here.
          vendorData: customerId,
        },
      }),
    }
  );

  const result =
    (await response.json()) as VeriffSessionResponse;

  if (!response.ok) {
    console.error(
      "Veriff create session failed:",
      response.status
    );

    throw new Error(
      `Unable to create Veriff session (${response.status})`
    );
  }

  if (
    !result.verification?.id ||
    !result.verification?.url
  ) {
    throw new Error(
      "Invalid response received from Veriff"
    );
  }

  return {
    sessionId: result.verification.id,
    verificationUrl: result.verification.url,
  };
};