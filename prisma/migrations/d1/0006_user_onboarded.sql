-- Add onboarded flag to User table
ALTER TABLE "User" ADD COLUMN "onboarded" BOOLEAN NOT NULL DEFAULT false;
