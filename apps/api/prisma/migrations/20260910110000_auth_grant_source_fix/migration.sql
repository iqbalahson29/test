-- Qualify the source column so PL/pgSQL never confuses it with a local variable.
CREATE OR REPLACE FUNCTION check_auth_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_purpose "OtpPurpose"; BEGIN
  SELECT c."purpose" INTO source_purpose FROM "AuthChallenge" c WHERE c.id=NEW."sourceChallengeId";
  IF NOT FOUND OR (NEW.action='PASSWORD_RESET' AND source_purpose<>'PASSWORD_RESET') OR (NEW.action<>'PASSWORD_RESET' AND source_purpose<>'STEP_UP') THEN RAISE EXCEPTION 'Invalid grant source'; END IF;
  RETURN NEW;
END $$;
