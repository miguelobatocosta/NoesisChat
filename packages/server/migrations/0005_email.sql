-- Sign-in with the Cloudflare Access email (D-52). One email per person; bots have none.
ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX users_email ON users (lower(email)) WHERE email IS NOT NULL;
