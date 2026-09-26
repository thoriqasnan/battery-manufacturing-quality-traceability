-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'QUALITY', 'PRODUCTION', 'ENGINEERING');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_username_format_check" CHECK (
        "username" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    ),
    CONSTRAINT "User_passwordHash_nonblank_check" CHECK (
        btrim("passwordHash") <> ''
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");
