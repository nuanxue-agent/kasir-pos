-- Mark all existing users as onboarded (they already set up their accounts before this feature)
UPDATE "User" SET "onboarded" = 1 WHERE "onboarded" = 0;
