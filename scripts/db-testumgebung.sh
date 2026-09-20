#!/usr/bin/env bash
# Stellt Supabase so weit nach, dass die Datenschicht wirklich geprueft werden
# kann: PostgreSQL mit den Rollen anon/authenticated/service_role, PostgREST
# davor, und die Schluessel als echte HS256-JWTs mit der Rolle im Anspruch.
#
#   bash scripts/db-testumgebung.sh      # aufsetzen und starten
#   npm run test:db                      # die Pruefungen dagegen
#
# Das Skript installiert nichts. Fehlt etwas, sagt es, was zu tun ist.
set -euo pipefail

ARBEIT="${TMPDIR:-/tmp}/kitflow-db-test"
GEHEIM="ein-geheimnis-mit-mindestens-32-zeichen!!"
DB="kitflow_test"

fehlt() { echo "FEHLT: $1"; echo "   $2"; exit 1; }

command -v psql >/dev/null || fehlt "psql" "apt-get install -y postgresql-16"
[ -d /usr/lib/postgresql ] || fehlt "PostgreSQL-Server" "apt-get install -y postgresql-16"
mkdir -p "$ARBEIT" "$ARBEIT/ablage"

if [ ! -x "$ARBEIT/postgrest" ]; then
  echo "PostgREST fehlt, wird geholt ..."
  curl -sSL -o "$ARBEIT/pgrst.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/v13.0.4/postgrest-v13.0.4-linux-static-x86-64.tar.xz"
  tar xf "$ARBEIT/pgrst.tar.xz" -C "$ARBEIT"
fi

pg_ctlcluster 16 main start 2>/dev/null || true

# Erst die Dienste beenden, dann die Datenbank wegwerfen: solange PostgREST
# noch daran haengt, laesst Postgres sie nicht fallen ("is being accessed by
# other users") - und das Skript lief beim zweiten Aufruf auf einen Fehler.
pkill -f "$ARBEIT/postgrest" 2>/dev/null || true
pkill -f "$ARBEIT/adapter.mjs" 2>/dev/null || true
sleep 1

echo "Datenbank $DB neu aufsetzen ..."
su postgres -c "psql -q -c 'drop database if exists $DB' -c 'create database $DB'"
su postgres -c "psql -q -d $DB" <<'SQL'
-- Die Rollen und Voreinstellungen, die Supabase in jedem Projekt anlegt.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then
    create role authenticator noinherit login password 'pgrst-test';
  end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant anon, authenticated, service_role to authenticator;
SQL

echo "Migration anwenden ..."
for datei in supabase/migrations/*.sql; do
  kopie="$ARBEIT/$(basename "$datei")"
  cp "$datei" "$kopie"; chmod 644 "$kopie"
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $kopie"
done

cat > "$ARBEIT/pgrst.conf" <<CONF
db-uri = "postgres://authenticator:pgrst-test@127.0.0.1:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$GEHEIM"
server-port = 3333
CONF

# Supabase serviert PostgREST unter /rest/v1; PostgREST selbst unter /. Der
# Adapter schneidet nur das Praefix ab, damit der echte Pfad aus db.ts laeuft.
cat > "$ARBEIT/adapter.mjs" <<'JS'
import { createServer, request } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Dazu die Ablage: Supabase Storage ist aus der Bauumgebung gesperrt (403 vom
// Proxy). Hier liegen die Dateien auf der Platte, und nachgestellt sind genau
// die drei Aufrufe, die src/lib/ablage.ts wirklich schickt.
const ABLAGE = process.env.ABLAGE_VERZEICHNIS ?? "/tmp/kitflow-db-test/ablage";
const EIMER = "/storage/v1/object/kitflow/";

/** Kein ../ aus dem Eimer heraus — dieselbe Sorgfalt wie im Echten. */
function imEimer(p) {
  const ziel = path.resolve(ABLAGE, p);
  return ziel.startsWith(ABLAGE + path.sep) ? ziel : null;
}

async function ablage(ein, aus, pfad) {
  const datei = imEimer(decodeURIComponent(pfad));
  if (!datei) { aus.writeHead(400); return aus.end("pfad"); }
  try {
    if (ein.method === "POST" || ein.method === "PUT") {
      const stuecke = [];
      for await (const s of ein) stuecke.push(s);
      await mkdir(path.dirname(datei), { recursive: true });
      await writeFile(datei, Buffer.concat(stuecke));
      await writeFile(datei + ".typ", ein.headers["content-type"] ?? "image/png");
      aus.writeHead(200, { "content-type": "application/json" });
      return aus.end(JSON.stringify({ Key: "kitflow/" + pfad }));
    }
    if (ein.method === "DELETE") {
      await rm(datei, { force: true });
      await rm(datei + ".typ", { force: true });
      aus.writeHead(200, { "content-type": "application/json" });
      return aus.end("{}");
    }
    const inhalt = await readFile(datei);
    const typ = await readFile(datei + ".typ", "utf8").catch(() => "image/png");
    aus.writeHead(200, { "content-type": typ, "content-length": inhalt.length });
    return aus.end(inhalt);
  } catch {
    aus.writeHead(404);
    return aus.end("");
  }
}

createServer((ein, aus) => {
  const ohneSuche = ein.url.split("?")[0];
  if (ohneSuche.startsWith(EIMER)) return ablage(ein, aus, ohneSuche.slice(EIMER.length));

  const pfad = ein.url.replace(/^\/rest\/v1/, "") || "/";
  const weiter = request(
    { host: "127.0.0.1", port: 3333, path: pfad, method: ein.method,
      headers: { ...ein.headers, host: "127.0.0.1:3333" } },
    (antwort) => { aus.writeHead(antwort.statusCode, antwort.headers); antwort.pipe(aus); },
  );
  weiter.on("error", (f) => { aus.writeHead(502); aus.end(String(f)); });
  ein.pipe(weiter);
}).listen(3344);
JS

nohup "$ARBEIT/postgrest" "$ARBEIT/pgrst.conf" > "$ARBEIT/pgrst.log" 2>&1 &
nohup node "$ARBEIT/adapter.mjs" > "$ARBEIT/adapter.log" 2>&1 &

ende=$(( $(date +%s) + 30 ))
until curl -s -o /dev/null "http://127.0.0.1:3344/rest/v1/" || [ "$(date +%s)" -ge "$ende" ]; do sleep 1; done

# Ein Supabase-Dienstschluessel IST ein HS256-JWT mit role=service_role.
DIENST=$(GEHEIM="$GEHEIM" node -e '
  const c = require("node:crypto");
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const kopf = b({ alg: "HS256", typ: "JWT" });
  const last = b({ role: "service_role", iss: "supabase", iat: 1758000000, exp: 2000000000 });
  const sig = c.createHmac("sha256", process.env.GEHEIM).update(kopf + "." + last).digest("base64url");
  console.log(kopf + "." + last + "." + sig);
')

echo
echo "Bereit. Fuer die Pruefungen:"
echo "  export DIENST='$DIENST'"
echo "  npm run test:db"
echo
echo "Logs: $ARBEIT/pgrst.log"
