-- CreateTable
CREATE TABLE "MicrosoftAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "msId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrosoftAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MicrosoftAccount_userId_key" ON "MicrosoftAccount"("userId");

-- CreateIndex
CREATE INDEX "MicrosoftAccount_email_idx" ON "MicrosoftAccount"("email");

-- AddForeignKey
ALTER TABLE "MicrosoftAccount" ADD CONSTRAINT "MicrosoftAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

