-- Fix demo user passwords (bcrypt of 'demo123')
UPDATE User SET password = '$2b$12$Bwn26tkHLPE6aEDqNzNmV.s.F7H9LDTMeTv3hEoGrEDlPNfH/QTaa' WHERE email IN ('owner@demo.com', 'cashier@demo.com');
