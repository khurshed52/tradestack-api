import { z } from "zod";

// The bridge forwards arbitrary event fields and supports unknown event types.
// Validate the JSON envelope without imposing a new provider payload contract.
export const mt5EventSchema = z.object({}).passthrough();
