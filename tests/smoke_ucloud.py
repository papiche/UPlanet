#!/usr/bin/env python3
"""Test de fumée de ucloud.html : charge la page, parcourt chaque onglet, relève les erreurs JavaScript.
Toutes les requêtes hors serveur statique sont simulées (réponses vides) ; la clé NOSTR est factice."""
import json, subprocess, sys, time, os, signal
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "earth")
PORT = 8765
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
HEX = "ab" * 32
INIT = """
window.nostr = { getPublicKey: async () => '%s',
  signEvent: async (e) => Object.assign({}, e, { id: '%s', pubkey: '%s', sig: '%s' }),
  nip44: { encrypt: async (p, t) => t, decrypt: async (p, t) => t } };
""" % (HEX, "0" * 64, HEX, "0" * 128)

STUBS = {
  "/api/cloud/status": {"enrolled": True, "files": 3, "bytes": 1000, "faceid": {"faces": 1, "no_face": 0, "pending": 0, "none": 0, "timeout": 0}},
  "/api/cloud/files/page": {"files": [], "total": 0, "counts": {"all": 0, "faces": 0, "no_face": 0, "waiting": 0, "received": 0}},
  "/mailjet/faces": {"faces": [], "truncated": False},
  "/api/contacts": {"contacts": [], "sync": {}, "sources": []},
  "/api/contacts/sources": {"sources": []},
  "/api/contacts/import/status": {"state": "idle"},
  "/api/facecloud/links": {"circles": [], "counts": {}, "n1": []},
  "/api/cloud/face-ref": {"enabled": True, "has_reference": True, "given": []},
  "/api/cloud/quota": {"used": 0, "limit": 1000, "pct": 0},
}

def handler(route):
    url = route.request.url
    path = url.split("://", 1)[1].split("/", 1)[1] if "://" in url else url
    path = "/" + path.split("?")[0]
    for k, v in STUBS.items():
        if path.startswith(k):
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(v))
    return route.fulfill(status=200, content_type="application/json", body="{}")

errors, consoles = [], []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_init_script(INIT)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: consoles.append(m.text) if m.type == "error" else None)
    def route_all(route):
        if f"127.0.0.1:{PORT}" in route.request.url and route.request.resource_type in ("document", "script", "stylesheet", "image", "font"):
            return route.continue_()
        return handler(route)
    page.route("**/*", route_all)
    page.goto(f"http://127.0.0.1:{PORT}/ucloud.html", wait_until="load")
    page.wait_for_timeout(2500)
    tabs = page.eval_on_selector_all(".fc-tab[data-tab]", "els => els.map(e => e.dataset.tab)")
    print("onglets :", tabs)
    for t in tabs:
        try:
            page.click(f'.fc-tab[data-tab="{t}"]', timeout=3000)
            page.wait_for_timeout(700)
            vis = page.evaluate("(t) => { const s = document.querySelector('.fc-page:not([hidden])'); return s ? s.id : null }", t)
            print(f"  {t:10} → vue visible : {vis}")
        except Exception as e:
            errors.append(f"clic onglet {t}: {str(e)[:100]}")
    # les raccourcis d'ancre
    for h in ("#personnes", "#contacts", "#photos", "#reglages", "#cercles"):
        page.evaluate("(h) => { location.hash = h }", h)
        page.wait_for_timeout(500)
    # assertions propres à la suppression de « Cercles »
    chk = page.evaluate("""() => ({
        tabCircles: !!document.querySelector('.fc-tab[data-tab="circles"]'),
        viewCircles: !!document.getElementById('view-circles'),
        meInSettings: !!document.querySelector('#view-settings #me-card'),
        faceRefInSettings: !!document.querySelector('#view-settings #faceref-card'),
        dlgVia: !!document.getElementById('dlg-via'), dlgRing: !!document.getElementById('dlg-ring'),
        circleFieldset: !!document.querySelector('#dlg-circle .fc-levels'),
        impStatus: !!document.getElementById('imp-status'),
        drCircleLabel: (document.getElementById('dr-circle')||{}).textContent,
    })""")
    print("contrôles :", chk)
    page.evaluate("() => { location.hash = '#cercles' }"); page.wait_for_timeout(600)
    print("ancre #cercles → vue :", page.evaluate("() => { const s = document.querySelector('.fc-page:not([hidden])'); return s && s.id }"))
    page.evaluate("() => { document.querySelector('.fc-tab[data-tab=\"contacts\"]').click() }"); page.wait_for_timeout(600)
    page.evaluate("() => { const b = document.getElementById('ct-import'); b && b.click() }"); page.wait_for_timeout(800)
    print("dialogue d'import ouvert :", page.evaluate("() => { const d = document.getElementById('dlg-ct-import'); return d && d.open }"))
    b.close()
srv.terminate()
uniq = sorted(set(errors))
print(f"\nerreurs JavaScript non interceptées : {len(uniq)}")
for e in uniq[:15]: print("  ", e[:170])
ce = sorted(set(c for c in consoles if "Failed to load resource" not in c))
print(f"messages console.error (hors ressources) : {len(ce)}")
for c in ce[:10]: print("  ", c[:170])
