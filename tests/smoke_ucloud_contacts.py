#!/usr/bin/env python3
"""ucloud.html : suivi d'import de contacts (fichier + carnet) et fiche d'une personne, avec des réponses simulées."""
import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "earth"); PORT = 8766
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
HEX = "ab" * 32; P1 = "11" * 32; P2 = "22" * 32
INIT = "window.nostr={getPublicKey:async()=>'%s',signEvent:async(e)=>Object.assign({},e,{id:'%s',pubkey:'%s',sig:'%s'})};" % (HEX, "0"*64, HEX, "0"*128)
state = {"status_calls": 0, "sources_calls": 0}
def face(i, name, pk="", via=""):
    return {"id": f"f{i}", "name": name, "pubkey": pk, "email": "", "photo": f"/Photos/a{i}.jpg", "timestamp": 1, "has_photo": True, "sent": None, "maybe": None, "group_id": None, "group_size": 0, "x": 0.1 * i, "y": 0.1, "via": via, "contact": ""}
def stub(path, method, body):
    if path.startswith("/mailjet/faces/thumbs"): return {"thumbs": {}}
    if path.startswith("/mailjet/faces"): return {"faces": [face(1, "Emma", P1), face(2, "Tim"), face(3, "Emma", P1), face(4, "Inconnu_1")]}
    if path.startswith("/api/facecloud/links"): return {"links": [{"pubkey": P1, "rel": "mutual", "name": "Emma", "display_name": "Emma"}, {"pubkey": P2, "rel": "out", "name": "Zoé", "display_name": "Zoé"}], "counts": {"mutual": 1, "out": 1}}
    if path.startswith("/api/contacts/reconcile"): return {"contacts": {}, "persons": {}}
    if path == "/api/contacts": return {"contacts": [{"name": "a.vcf", "uid": "u1", "fn": "Contact A", "org": "", "emails": [], "tels": [], "note": "", "bday": "", "nostr": "", "has_photo": False, "avatar": ""}], "sync": {}, "sources": [
        {"id": "s1", "label": "Mon Nextcloud", "progress": {"state": "running", "phase": "apply", "total": 1250, "done": 340, "created": 300, "updated": 40}, "last_sync": None}]}
    if path == "/api/contacts/sources" and method == "GET":
        state["sources_calls"] += 1
        return {"sources": [{"id": "s1", "label": "Mon Nextcloud", "progress": {"state": "running", "phase": "apply", "total": 1250, "done": 340 + 100 * state["sources_calls"], "created": 300, "updated": 40}, "last_sync": None}]}
    if path == "/api/contacts/import/status":
        state["status_calls"] += 1
        if state["status_calls"] < 3: return {"state": "running", "name": "c.vcf", "total": 120, "done": 30 * state["status_calls"], "created": 25, "updated": 3, "errors": 1, "started": 111}
        return {"state": "done", "name": "c.vcf", "total": 120, "done": 120, "created": 110, "updated": 8, "errors": 2, "started": 111, "finished": 222}
    if path == "/api/contacts/import-vcf": return {"state": "running", "name": "c.vcf", "total": 120, "done": 0, "created": 0, "updated": 0, "errors": 0, "started": 111}
    if path.startswith("/api/cloud/face-ref"): return {"enabled": True, "has_reference": True, "given": []}
    if path.startswith("/api/cloud/files/page"): return {"files": [], "total": 0, "counts": {"all": 0, "faces": 0, "no_face": 0, "waiting": 0, "received": 0}}
    if path.startswith("/api/cloud/status"): return {"enrolled": True, "files": 3, "bytes": 1, "faceid": {"faces": 4, "no_face": 0, "pending": 0, "none": 0, "timeout": 0}}
    return {}
errors, out = [], {}
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 1280, "height": 900}); ctx.add_init_script(INIT)
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    def route(r):
        u = r.request.url
        if f"127.0.0.1:{PORT}" in u and r.request.resource_type in ("document", "script", "stylesheet", "image", "font"): return r.continue_()
        path = "/" + u.split("://", 1)[1].split("/", 1)[1].split("?")[0]
        return r.fulfill(status=200, content_type="application/json", body=json.dumps(stub(path, r.request.method, None)))
    page.route("**/*", route)
    page.goto(f"http://127.0.0.1:{PORT}/ucloud.html", wait_until="load"); page.wait_for_timeout(2500)
    # ── 1. fiche d'une personne
    out["personnes"] = page.evaluate("() => (window.App && App.persons) ? App.persons.map(p => p.name) : null")
    out["liens_kind3"] = page.evaluate("() => App.nostrLinks ? Object.keys(App.nostrLinks).length : null")
    page.evaluate("() => { const p = App.persons.find(x => x.name === 'Emma'); openCircle(p.key); }")
    page.wait_for_timeout(500)
    out["fiche_ouverte"] = page.evaluate("() => document.getElementById('dlg-circle').open")
    out["fiche_trace"] = page.evaluate("() => document.getElementById('circ-trace').textContent")
    out["amis_proposes"] = page.evaluate("() => document.getElementById('circ-friend').options.length")
    page.evaluate("() => document.getElementById('dlg-circle').close()")
    # ── 2. import : carnet CardDAV en cours (200 s de progression simulée)
    page.evaluate("() => document.querySelector('.fc-tab[data-tab=\"contacts\"]').click()"); page.wait_for_timeout(600)
    page.evaluate("() => document.getElementById('ct-import').click()"); page.wait_for_timeout(2200)
    out["carnet_ligne"] = page.evaluate("() => document.getElementById('imp-sources').innerText.replace(/\\s+/g,' ').slice(0,200)")
    out["carnet_barre"] = page.evaluate("() => !!document.querySelector('#imp-sources progress')")
    out["bouton_maj_desactive"] = page.evaluate("() => document.querySelector('#imp-sources [data-src=\"sync\"]').disabled")
    # ── 3. import d'un fichier .vcf volumineux (tâche de fond simulée)
    page.evaluate("() => document.querySelector('[data-imp=\"file\"]').click()")
    page.set_input_files("#ct-vcf-file", {"name": "c.vcf", "mimeType": "text/vcard", "buffer": b"BEGIN:VCARD\nVERSION:3.0\nFN:X\nEND:VCARD\n"})
    page.wait_for_timeout(1800)
    out["fichier_en_cours"] = page.evaluate("() => document.getElementById('imp-status').innerText.replace(/\\s+/g,' ')")
    page.wait_for_timeout(4200)
    out["fichier_termine"] = page.evaluate("() => document.getElementById('imp-status').innerText.replace(/\\s+/g,' ')")
    out["fichier_classe"] = page.evaluate("() => document.getElementById('imp-status').className")
    # fichier qui n'est pas un .vcf
    page.set_input_files("#ct-vcf-file", {"name": "photo.jpg", "mimeType": "image/jpeg", "buffer": b"xx"})
    page.wait_for_timeout(400)
    out["mauvais_fichier"] = page.evaluate("() => document.getElementById('imp-status').innerText")
    b.close()
srv.terminate()
for k, v in out.items(): print(f"{k:22} {v}")
print("\nerreurs JavaScript :", sorted(set(errors)) or "aucune")
