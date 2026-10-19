#!/usr/bin/env python3
"""Test de fumée de moncompte.html : onglets (dont « Ce que BRO sait de moi »), ancres, liste des souvenirs.
Requêtes simulées, clé NOSTR factice. Usage : ~/.astro/bin/python3 UPlanet/tests/smoke_moncompte.py"""
import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright

ROOT = os.path.expanduser("~/workspace/AAA/UPlanet/earth")
PORT = 8766
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
HEX = "ab" * 32
INIT = """
window.nostr = { getPublicKey: async () => '%s',
  signEvent: async (e) => Object.assign({}, e, { id: '%s', pubkey: '%s', sig: '%s' }) };
window.userPubkey = '%s';
""" % (HEX, "0" * 64, HEX, "0" * 128, HEX)
FLUX = {"alerts": {"enabled": True, "email": True, "nostr": False}, "usociety": {"enabled": True, "email": True, "nostr": False}}
OVERVIEW = {"email": "test@example.invalid", "zencard": False, "is_captain": False, "g1pub": "",
  "quota": {"used": 10, "quota": 1000, "pct": 1, "label": "MULTIPASS"}, "security": {"pass_active": True, "restore_disabled": False},
  "notifications": {"flux": FLUX, "flux_meta": {k: {"title": k, "desc": ""} for k in FLUX}, "kin": {"scope": "n1", "types": []}, "kin_types": {}},
  "memory": {"conversations": 1, "bro_memory": 2}}
ITEMS = {"ok": True, "total": 2, "items": [
  {"id": "1", "content": "Est allergique aux noix", "kind": "fact", "source": "manual", "visibility": "private", "confidence": 1, "edited": False, "pinned": True, "timestamp": "2026-10-19T10:00:00Z"},
  {"id": "2", "content": "Aime le jazz", "kind": "trait", "source": "chat", "visibility": "private", "confidence": .8, "edited": False, "pinned": False, "timestamp": "2026-10-18T10:00:00Z"}]}
STUBS = {"/api/account/overview": OVERVIEW, "/api/account/memory/items": ITEMS,
         "/api/account/memory/sources": {"ok": True, "queue": 0, "sources": [{"source": "chat", "label": "Mes échanges avec BRO", "enabled": True, "default": True, "memories": 1, "visibility": "private"}]}}
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1100, "height": 900}); ctx.add_init_script(INIT)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    def route(r):
        u = r.request.url
        if f"127.0.0.1:{PORT}" in u and r.request.resource_type in ("document", "script", "stylesheet", "image", "font"):
            return r.continue_()
        path = "/" + u.split("://", 1)[1].split("/", 1)[1].split("?")[0]
        for k, v in STUBS.items():
            if path.startswith(k):
                return r.fulfill(status=200, content_type="application/json", body=json.dumps(v))
        return r.fulfill(status=200, content_type="application/json", body="{}")
    page.route("**/*", route)
    page.goto(f"http://127.0.0.1:{PORT}/moncompte.html#memoire", wait_until="load")
    page.wait_for_timeout(2500)
    tabs = page.eval_on_selector_all(".nav .tab", "els => els.map(e => e.dataset.tab)")
    vis = lambda: page.evaluate("() => [...document.querySelectorAll('.pane')].filter(p => !p.hidden).map(p => p.dataset.pane)")
    print("onglets :", tabs)
    print("ancre #memoire → visible :", vis())
    print("souvenirs affichés :", page.eval_on_selector_all("#mem-list .mem-it", "e => e.length"),
          "· badge « de votre main » :", page.eval_on_selector_all("#mem-list .badge.ok", "e => e.some(x => x.textContent.includes('main'))"))
    for t in tabs:
        page.click(f'.nav .tab[data-tab="{t}"]'); page.wait_for_timeout(200)
        print(f"  {t:8} → {vis()}")
    page.evaluate("() => { location.hash = '#liens' }"); page.wait_for_timeout(300)
    print("ancre #liens → visible :", vis())
    page.evaluate("() => { location.hash = '#securite' }"); page.wait_for_timeout(300)
    print("ancre #securite → visible :", vis())
    b.close()
srv.terminate()
u = sorted(set(errors)); print(f"\nerreurs JavaScript : {len(u)}")
for e in u[:10]: print("  ", e[:170])
