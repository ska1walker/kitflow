import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { hubspot, hubspotAktiv } from "./hubspot";

/**
 * Die Schicht zu HubSpot ist der einzige Engpass: jeder Zugriff geht durch
 * `hubspot()`. Was sie bei einer Störung tut, entscheidet deshalb über die
 * ganze Anwendung — und ein Rate-Limit ist keine Störung, sondern Alltag.
 *
 * Wiederholt werden darf nur, was nichts verändert. Ein wiederholtes POST auf
 * /objects/deals legte sonst zwei Vorgänge an.
 */

function antwort(status: number, koerper: unknown = {}, kopf: Record<string, string> = {}) {
  return new Response(JSON.stringify(koerper), { status, headers: kopf });
}

let fetchFake: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.HUBSPOT_TOKEN = "zz-test";
  fetchFake = vi.fn();
  vi.stubGlobal("fetch", fetchFake);
  // Die Pausen sollen den Test nicht ausbremsen.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((f: () => void) => {
    f();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.HUBSPOT_TOKEN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ohne Anmeldung", () => {
  test("wird gar nicht erst gefragt", async () => {
    delete process.env.HUBSPOT_TOKEN;
    expect(hubspotAktiv()).toBe(false);
    expect(await hubspot({ pfad: "/crm/v3/objects/deals/search", koerper: {} })).toBeNull();
    expect(fetchFake).not.toHaveBeenCalled();
  });
});

describe("Lesen darf wiederholt werden", () => {
  test("429, dann Erfolg", async () => {
    fetchFake
      .mockResolvedValueOnce(antwort(429, {}, { "retry-after": "1" }))
      .mockResolvedValueOnce(antwort(200, { results: [{ id: "1" }] }));

    const d = await hubspot<{ results: { id: string }[] }>({
      pfad: "/crm/v3/objects/contacts/search",
      koerper: {},
    });

    expect(d?.results).toHaveLength(1);
    expect(fetchFake).toHaveBeenCalledTimes(2);
  });

  test("500, dann Erfolg", async () => {
    fetchFake.mockResolvedValueOnce(antwort(503)).mockResolvedValueOnce(antwort(200, { ok: 1 }));
    expect(await hubspot({ pfad: "/crm/v3/pipelines/deals" })).toEqual({ ok: 1 });
    expect(fetchFake).toHaveBeenCalledTimes(2);
  });

  test("ein abgerissenes Netz zählt als vorübergehend", async () => {
    fetchFake
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(antwort(200, { ok: 1 }));
    expect(await hubspot({ pfad: "/crm/v3/pipelines/deals" })).toEqual({ ok: 1 });
  });

  test("dauerhaft 429: irgendwann null, aber nicht endlos", async () => {
    fetchFake.mockResolvedValue(antwort(429));
    expect(await hubspot({ pfad: "/crm/v3/objects/contacts/search", koerper: {} })).toBeNull();
    expect(fetchFake).toHaveBeenCalledTimes(3);
  });

  test("Stapel-Lesen zählt als Lesen", async () => {
    fetchFake.mockResolvedValueOnce(antwort(429)).mockResolvedValueOnce(antwort(200, { ok: 1 }));
    await hubspot({ pfad: "/crm/v3/objects/contacts/batch/read", koerper: {} });
    expect(fetchFake).toHaveBeenCalledTimes(2);
  });
});

describe("Schreiben wird nie wiederholt", () => {
  test.for([
    ["Vorgang anlegen", "/crm/v3/objects/deals", "POST" as const],
    ["Kontakt ändern", "/crm/v3/objects/contacts/1", "PATCH" as const],
    ["verknüpfen", "/crm/v4/objects/deals/1/associations/default/contacts/2", "PUT" as const],
  ] as const)("%s", async ([, pfad, methode]) => {
    fetchFake.mockResolvedValue(antwort(429));
    expect(await hubspot({ pfad, methode, koerper: {} })).toBeNull();
    // Ein zweiter Versuch legte einen zweiten Vorgang an.
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });
});

describe("Endgültige Fehler", () => {
  test.for([400, 401, 403, 404])("%i wird nicht wiederholt", async (status) => {
    fetchFake.mockResolvedValue(antwort(status));
    expect(await hubspot({ pfad: "/crm/v3/objects/deals/search", koerper: {} })).toBeNull();
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  test("kein Token und keine Personendaten in der Meldung", async () => {
    const meldungen: string[] = [];
    vi.mocked(console.error).mockImplementation((...a: unknown[]) => {
      meldungen.push(a.map(String).join(" "));
    });
    fetchFake.mockResolvedValue(antwort(400, { message: "Kai Böhm ist ungültig" }));
    await hubspot({ pfad: "/crm/v3/objects/contacts/36737235175", methode: "PATCH", koerper: {} });

    const alles = meldungen.join("\n");
    expect(alles).not.toContain("zz-test");
    expect(alles).not.toContain("Böhm");
  });
});

describe("Nexts Dynamik-Signal", () => {
  test("wird durchgereicht, nicht geschluckt", async () => {
    // Schluckten wir es, würde die Route fälschlich statisch gebaut.
    const signal = Object.assign(new Error("dynamic"), { digest: "DYNAMIC_SERVER_USAGE" });
    fetchFake.mockRejectedValue(signal);
    await expect(hubspot({ pfad: "/crm/v3/pipelines/deals" })).rejects.toBe(signal);
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });
});
