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

# HubSpot aus Pappe, aber ueber HTTP. Damit kann ein Browser-Lauf die Oberflaeche
# pruefen, ohne im echten CRM des Vereins herumzuschreiben — eine Testmannschaft
# dort anzulegen und wieder zu loeschen waere jedes Mal eine Gelegenheit, etwas
# Echtes zu erwischen.
cat > "$ARBEIT/kontakte.json" <<'JSON'
{
  "9001": { "firstname": "Anna", "lastname": "Zwiebel", "email": "anna.zz@example.invalid",
            "team": "ZZ Testteam", "sparte": "Fußball", "trainingsanzug_oberteil": "M" },
  "9002": { "firstname": "Bernd", "lastname": "Zwerg", "email": "bernd.zz@example.invalid",
            "team": "ZZ Testteam", "sparte": "Fußball" },
  "9003": { "firstname": "Clara", "lastname": "Zander", "email": "clara.zz@example.invalid",
            "team": "ZZ Testteam", "sparte": "Fußball" }
}
JSON

cat > "$ARBEIT/hubspot.mjs" <<'JS'
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const DATEI = process.env.KONTAKTE ?? "/tmp/kitflow-db-test/kontakte.json";
const laden = () => (existsSync(DATEI) ? JSON.parse(readFileSync(DATEI, "utf8")) : {});
const alsObjekt = (id, p) => ({ id, properties: { hs_object_id: id, ...p } });
createServer(async (ein, aus) => {
  const st = []; for await (const s of ein) st.push(s);
  const koerper = st.length ? JSON.parse(Buffer.concat(st).toString()) : undefined;
  const pfad = ein.url.split("?")[0];
  const kontakte = laden();
  const json = (w) => { aus.writeHead(200, { "content-type": "application/json" }); aus.end(JSON.stringify(w)); };

  if (pfad.endsWith("/contacts/batch/read")) {
    const ids = (koerper?.inputs ?? []).map((i) => String(i.id));
    return json({ results: ids.filter((i) => kontakte[i]).map((i) => alsObjekt(i, kontakte[i])) });
  }
  if (pfad.endsWith("/contacts/search")) {
    const f = koerper?.filterGroups?.[0]?.filters?.[0];
    const treffer = Object.entries(kontakte).filter(([, p]) => {
      if (!f) return true;
      const wert = String(p[f.propertyName] ?? "");
      if (f.operator === "EQ") return wert.toLowerCase() === String(f.value).toLowerCase();
      if (f.operator === "CONTAINS_TOKEN") return wert.includes(String(f.value));
      return true;
    });
    return json({ total: treffer.length, results: treffer.map(([i, p]) => alsObjekt(i, p)) });
  }
  if (pfad.startsWith("/crm/v3/objects/contacts/") && ein.method === "PATCH") {
    const id = decodeURIComponent(pfad.split("/").pop());
    kontakte[id] = { ...(kontakte[id] ?? {}), ...(koerper?.properties ?? {}) };
    writeFileSync(DATEI, JSON.stringify(kontakte, null, 2));
    return json(alsObjekt(id, kontakte[id]));
  }
  // Der Spiegel im CRM ist nur Sicht und darf hier ins Leere laufen.
  return json({ results: [] });
}).listen(3346);
JS

nohup "$ARBEIT/postgrest" "$ARBEIT/pgrst.conf" > "$ARBEIT/pgrst.log" 2>&1 &
nohup node "$ARBEIT/hubspot.mjs" > "$ARBEIT/hubspot.log" 2>&1 &
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

# Ein Vorgang fuer die Browser-Laeufe. AUS-2026-900 liegt weit weg von den
# echten Nummern, damit niemand ihn verwechselt.
su postgres -c "psql -q -d $DB" <<'SQL'
insert into vorgang (nummer, mannschaften, ausstattungsart, stufe, trainer_email,
                     lieferadresse, groessen_frist, initialen_noetig, sponsor)
values ('AUS-2026-900', array['ZZ Testteam'], 'Weitere Ausstattung', 1,
        'kai@example.invalid', 'Am Sportplatz 14', '2026-10-30', true, 'Beispiel GmbH')
on conflict (nummer) do nothing;

insert into vorgang_artikel (vorgang_id, bezeichnung, hersteller, groessenart, stueck)
select id, 'Trainingsjacke', 'adidas', 'oberteil', 1 from vorgang
where nummer = 'AUS-2026-900'
  and not exists (select 1 from vorgang_artikel a where a.vorgang_id = vorgang.id);

insert into vorgang_person (vorgang_id, hs_kontakt_id)
select v.id, k from vorgang v, unnest(array['9001','9002','9003']) k
where v.nummer = 'AUS-2026-900'
on conflict do nothing;
SQL

echo
echo "Bereit. Fuer die Pruefungen:"
echo "  export DIENST='$DIENST'"
echo "  npm run test:db"
echo
echo "Fuer die Browser-Laeufe zusaetzlich:"
echo "  export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3344"
echo "  export HUBSPOT_BASIS=http://127.0.0.1:3346"
echo "  export LINK_SECRET=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
echo "  npm run build && npx next start -p 3100"
echo "  npm run test:ui && npm run test:kette"
echo
echo "Logs: $ARBEIT/pgrst.log"
