
import { chunkText } from "../modules/ai/rag/chunking.service.js";

const document = `
KYC Verification Overview

Customers must complete their KYC profile before
proceeding to identity verification.

Identity Verification

Customers may be asked to continue verification
using a smartphone and a valid identity document.

Verification Troubleshooting

If identity verification cannot be completed,
customers should follow the instructions displayed
by the verification provider or contact support.
`;

const chunks = chunkText(document, 150);

console.log("Total chunks:", chunks.length);

for (const chunk of chunks) {
  console.log(`\nChunk ${chunk.chunkIndex}`);
  console.log(chunk.content);
  console.log("Characters:", chunk.content.length);
}
