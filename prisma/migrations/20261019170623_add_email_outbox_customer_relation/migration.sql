-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Customer"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
