-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "dodo_customer_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_dodo_customer_id_key" ON "organizations"("dodo_customer_id");

