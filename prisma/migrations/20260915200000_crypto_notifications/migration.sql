CREATE FUNCTION notify_crypto_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('crypto_changed', '');
  RETURN NULL;
END;
$$;
CREATE TRIGGER crypto_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "Crypto"
FOR EACH STATEMENT EXECUTE FUNCTION notify_crypto_change();
CREATE TRIGGER crypto_history_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "CryptoPriceHistory"
FOR EACH STATEMENT EXECUTE FUNCTION notify_crypto_change();
