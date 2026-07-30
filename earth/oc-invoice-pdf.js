// ══════════════════════════════════════════════════════════════════════════
// oc-invoice-pdf.js — Facturation Armateur/Capitaine : PDF + certification IPFS
// ══════════════════════════════════════════════════════════════════════════
// Module autonome consommé par oc_admin.html (onglet Facturation). Ne dépend
// que de jspdf.umd.min.js (chargé avant ce fichier) + de la stack commune
// (nostr.bundle.js, common.js) pour window.nostr / window.nostrRelay /
// window.userPubkey / window.getAPIUrl().
//
// Flux complet (deux étapes distinctes, jamais fusionnées) :
//   1. OCInvoicePDF.generateAndPublish(invoice)
//        → construit le PDF + la page de certification HTML, uploade les deux
//          via /api/fileupload, publie un event kind 30851 (type=debit,
//          status=PENDING) PAR LIGNE avec les CIDs. Aucun Ẑen n'est brûlé ici.
//   2. (action Capitaine séparée : POST /api/oc_admin/invoice/burn — voir
//      oc_admin.html) → puis OCInvoicePDF.finalizeAfterBurn(invoice, burnResult, cids)
//        → republie CHAQUE event 30851 avec le statut définitif (ok/burn_failed/
//          burned_but_oc_failed) en conservant pdf_cid/cert_cid (le premier
//          event de ZEN.INVOICE.sh ne les connaît pas — c'est cette republication
//          côté client qui les rend visibles sur l'event définitif).
//
// d_tag IDENTIQUE à celui posé par Astroport.ONE/RUNTIME/ZEN.INVOICE.sh :
//   oc-burn-{invoice_id}:{role}:{node_id}:{payee_email}
// Event adressable (NIP-33) : republier avec le même d_tag REMPLACE la version
// précédente sur le relay, jamais un doublon.
//
// invoice = {
//   invoice_id: "FACTURE-20260729120000",
//   date: "2026-07-29",                       // AAAA-MM-JJ
//   constellation: "<UPLANETG1PUB>",           // cf. index.html/economy.html — à charger par l'appelant depuis 12345.json
//   issuer: { name, address, siret, email },   // identité Armateur ou Capitaine émetteur de CETTE facture
//   recipient: "Collectif G1FabLab (OpenCollective)",
//   lines: [
//     { role: "armateur"|"capitaine", node_id, payee_email, amount_zen, description }
//   ]
// }
// ══════════════════════════════════════════════════════════════════════════

var OCInvoicePDF = (function () {
    'use strict';

    // Identique à forge.html::_ipfsGateway() — même hôte que la page, port 8080.
    function _ipfsGateway() {
        var h = location.hostname;
        if (h === '127.0.0.1' || h === 'localhost') return 'http://127.0.0.1:8080';
        return location.protocol + '//' + h + ':8080';
    }

    function _apiUrl() {
        return window.getAPIUrl ? window.getAPIUrl() : 'http://127.0.0.1:54321';
    }

    function _dTag(invoiceId, role, nodeId, payeeEmail) {
        return 'oc-burn-' + invoiceId + ':' + role + ':' + (nodeId || '') + ':' + (payeeEmail || '');
    }

    function _total(invoice) {
        return invoice.lines.reduce(function (sum, l) { return sum + (Number(l.amount_zen) || 0); }, 0);
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    // Mise en page volontairement sobre (identité émetteur, tableau de lignes,
    // total, mentions légales, lien de vérification) — pas de logo/graphisme,
    // reproductible sans dépendance externe.
    function buildPdf(invoice) {
        var jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
        if (!jsPDFCtor) throw new Error('jsPDF non chargé — vérifier <script src="jspdf.umd.min.js"> avant oc-invoice-pdf.js');

        var doc = new jsPDFCtor({ unit: 'mm', format: 'a4' });
        var pageW = doc.internal.pageSize.getWidth();
        var marginL = 15, marginR = pageW - 15;
        var y = 20;

        // Émetteur
        doc.setFontSize(14); doc.setFont(undefined, 'bold');
        doc.text(invoice.issuer.name || '(émetteur non renseigné)', marginL, y);
        doc.setFont(undefined, 'normal'); doc.setFontSize(10);
        [invoice.issuer.address, invoice.issuer.siret ? ('SIRET : ' + invoice.issuer.siret) : null, invoice.issuer.email]
            .filter(Boolean)
            .forEach(function (line) { y += 5; doc.text(String(line), marginL, y); });

        // Titre + n° facture + date (aligné à droite)
        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text('FACTURE ' + invoice.invoice_id, marginR, 20, { align: 'right' });
        doc.setFontSize(10); doc.setFont(undefined, 'normal');
        doc.text('Date : ' + invoice.date, marginR, 27, { align: 'right' });

        // Destinataire
        y += 12;
        doc.setFont(undefined, 'bold'); doc.text('Destinataire :', marginL, y);
        doc.setFont(undefined, 'normal');
        y += 5;
        doc.text(invoice.recipient || 'Collectif UPlanet (OpenCollective)', marginL, y);

        // Tableau des lignes
        y += 12;
        var colDesc = marginL, colRole = marginL + 95, colAmount = marginR;
        doc.setFont(undefined, 'bold'); doc.setFontSize(10);
        doc.text('Description', colDesc, y);
        doc.text('Rôle', colRole, y);
        doc.text('Montant (Zen)', colAmount, y, { align: 'right' });
        doc.setLineWidth(0.3); doc.line(marginL, y + 2, marginR, y + 2);
        doc.setFont(undefined, 'normal');
        y += 8;

        invoice.lines.forEach(function (l) {
            var desc = String(l.description || l.role || '');
            var wrapped = doc.splitTextToSize(desc, colRole - colDesc - 5);
            doc.text(wrapped, colDesc, y);
            doc.text(l.role || '', colRole, y);
            doc.text(Number(l.amount_zen || 0).toFixed(2), colAmount, y, { align: 'right' });
            y += Math.max(7, wrapped.length * 5);
        });

        y += 3;
        doc.line(marginL, y, marginR, y);
        y += 7;
        doc.setFont(undefined, 'bold'); doc.setFontSize(11);
        doc.text('Total : ' + _total(invoice).toFixed(2) + ' Zen', colAmount, y, { align: 'right' });

        // Mentions légales — "Ẑ" (U+1E90) hors WinAnsiEncoding : illisible avec les
        // polices standard jsPDF (Helvetica/Times/Courier) sans police embarquée,
        // donc "Zen" en toutes lettres ici (le caractère complet reste correct
        // dans la page de certification HTML et le contenu NOSTR, rendus en UTF-8).
        y += 12;
        doc.setFont(undefined, 'normal'); doc.setFontSize(8);
        doc.text('TVA non applicable, art. 293 B du CGI.', marginL, y);
        y += 5;
        var legalLines = doc.splitTextToSize(
            "Phase alpha UPlanet ORIGIN — les Zen émis/brûlés dans ce régime seront transférés vers UPlanet Zen au lancement de la constellation.",
            marginR - marginL
        );
        doc.text(legalLines, marginL, y);
        y += legalLines.length * 4;

        // Le lien de vérification est ajouté après coup par appendVerificationLink
        // (cf. generateAndPublish) : la page de certification doit être uploadée
        // EN PREMIER pour connaître son CID avant de finaliser ce PDF — l'inverse
        // (PDF d'abord) créerait une dépendance circulaire entre les deux CIDs.
        return doc;
    }

    // Ajoute le lien de vérification en bas de page une fois le cert_cid connu.
    // Appelé APRÈS buildPdf() et AVANT le rendu final (.output()) — jamais après
    // upload du PDF (sinon incohérence entre le PDF affiché et celui réellement
    // stocké sur IPFS).
    function appendVerificationLink(doc, certUrl) {
        var pageH = doc.internal.pageSize.getHeight();
        var pageW = doc.internal.pageSize.getWidth();
        doc.setFontSize(8); doc.setTextColor(40, 90, 200);
        doc.textWithLink('Vérifier cette facture : ' + certUrl, 15, pageH - 12, { url: certUrl });
        doc.setTextColor(0, 0, 0);
        return doc;
    }

    // ── Page de certification (HTML autonome, sans dépendance externe) ───────
    function buildCertificationHtml(invoice, opts) {
        opts = opts || {};
        var rowsHtml = invoice.lines.map(function (l) {
            var d = _dTag(invoice.invoice_id, l.role, l.node_id, l.payee_email);
            return '<tr><td>' + _esc(l.description || '') + '</td><td>' + _esc(l.role) + '</td>' +
                '<td>' + _esc(l.node_id || '') + '</td><td>' + _esc(l.payee_email || '') + '</td>' +
                '<td style="text-align:right">' + Number(l.amount_zen || 0).toFixed(2) + ' Ẑ</td>' +
                '<td style="font-family:monospace;font-size:11px">' + _esc(d) + '</td></tr>';
        }).join('\n');

        return '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
            '<title>Certification ' + _esc(invoice.invoice_id) + '</title>' +
            '<style>' +
            'body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}' +
            'h1{font-size:1.3rem}table{width:100%;border-collapse:collapse;margin-top:1rem;font-size:13px}' +
            'th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f4f4f4}' +
            '.meta{color:#555;font-size:13px;line-height:1.6}code{background:#f4f4f4;padding:1px 5px;border-radius:3px}' +
            '@media (prefers-color-scheme:dark){body{background:#111;color:#eee}th{background:#222}th,td{border-color:#333}code{background:#222}}' +
            '</style></head><body>' +
            '<h1>Certification de facturation — ' + _esc(invoice.invoice_id) + '</h1>' +
            '<p class="meta">Émetteur : ' + _esc(invoice.issuer.name || '') + '<br>' +
            'Destinataire : ' + _esc(invoice.recipient || '') + '<br>' +
            'Date : ' + _esc(invoice.date) + '<br>' +
            'Constellation (UPLANETG1PUB) : <code>' + _esc(invoice.constellation || '') + '</code><br>' +
            (opts.pdfCid ? ('PDF facture : <code>' + _esc(opts.pdfCid) + '</code><br>') : '') +
            '</p>' +
            '<p class="meta">Chaque ligne ci-dessous est tracée par un event NOSTR adressable (kind 30851,' +
            ' type=debit) identifié par son tag <code>d</code> — son statut (PENDING/OK/FAIL) évolue au fil' +
            ' du burn réel, sans jamais changer d\'identifiant.</p>' +
            '<table><thead><tr><th>Description</th><th>Rôle</th><th>Nœud</th><th>Bénéficiaire</th>' +
            '<th>Montant</th><th>Référence NOSTR (d-tag, kind 30851)</th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody></table>' +
            '<p class="meta">Total : <strong>' + _total(invoice).toFixed(2) + ' Ẑ</strong></p>' +
            '<p class="meta">Généré le ' + new Date().toISOString() + '. TVA non applicable, art. 293 B du CGI. ' +
            'Phase alpha UPlanet ORIGIN — transfert vers UPlanet Ẑen au lancement de la constellation.</p>' +
            '</body></html>';
    }

    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ── Upload IPFS via /api/fileupload (NIP-98, pattern forge.html) ─────────
    function uploadBlob(blob, filename) {
        var uploadUrl = _apiUrl() + '/api/fileupload';
        var authEv = {
            kind: 27235,
            pubkey: window.userPubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['u', uploadUrl], ['method', 'POST']],
            content: '',
        };
        return _sign(authEv).then(function (signed) {
            var token = btoa(unescape(encodeURIComponent(JSON.stringify(signed))));
            var fd = new FormData();
            fd.append('file', blob, filename);
            return fetch(uploadUrl, { method: 'POST', headers: { 'Authorization': 'Nostr ' + token }, body: fd });
        }).then(function (resp) {
            if (!resp.ok) return resp.text().then(function (t) { throw new Error(resp.status + ' — ' + t); });
            return resp.json();
        }).then(function (data) {
            var cid = data.file_cid || data.new_cid;
            if (!cid) throw new Error('Réponse /api/fileupload sans CID (' + filename + ')');
            return cid;
        });
    }

    // ── Signature NOSTR (NIP-07 en priorité, fallback clef mémoire) ──────────
    function _sign(evTemplate) {
        if (window.nostr && window.nostr.signEvent) return window.nostr.signEvent(evTemplate);
        if (window.userPrivateKey && window.NostrTools && window.NostrTools.finishEvent) {
            try { return Promise.resolve(window.NostrTools.finishEvent(evTemplate, window.userPrivateKey)); }
            catch (e) { return Promise.reject(e); }
        }
        return Promise.reject(new Error('Aucun moyen de signer — installez nos2x ou Alby'));
    }

    function _publish(signed) {
        try { window.nostrRelay && window.nostrRelay.publish(signed); } catch (e) { /* best-effort */ }
        return signed;
    }

    // ── Preuve NOSTR kind 30851 (type=debit) — schéma NIP-101/KIND_REGISTRY.md ─
    function publishBurnProof(invoice, line, status, extra) {
        extra = extra || {};
        var dTag = _dTag(invoice.invoice_id, line.role, line.node_id, line.payee_email);
        var content = Object.assign({
            type: 'debit',
            role: line.role,
            node_id: line.node_id || '',
            email: line.payee_email || '',
            amount: Number(line.amount_zen) || 0,
            invoice_id: invoice.invoice_id,
            status: status,
            generated_at: new Date().toISOString(),
            uplanet: invoice.constellation || '',
        }, extra);

        var tags = [
            ['d', dTag], ['t', 'uplanet'], ['t', 'oc-burn'], ['type', 'debit'],
            ['s', status],
            ['email', line.payee_email || ''], ['amount', String(line.amount_zen || 0)],
            ['role', line.role], ['node', line.node_id || ''],
            ['invoice_id', invoice.invoice_id],
            ['constellation', invoice.constellation || ''],
        ];
        if (extra.pdf_cid) tags.push(['pdf_cid', extra.pdf_cid]);
        if (extra.cert_cid) tags.push(['cert_cid', extra.cert_cid]);
        if (extra.expense_id) tags.push(['expense_id', String(extra.expense_id)]);

        var evTemplate = {
            kind: 30851,
            pubkey: window.userPubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: tags,
            content: JSON.stringify(content),
        };
        return _sign(evTemplate).then(_publish);
    }

    // ── Orchestration étape 1 : PDF + certification + upload + PENDING ───────
    // N'exécute AUCUN burn. Retourne {pdf_cid, cert_cid, events} — à conserver
    // côté appelant pour appeler finalizeAfterBurn une fois le burn confirmé.
    function generateAndPublish(invoice) {
        if (!window.userPubkey) return Promise.reject(new Error('Non connecté (NOSTR)'));
        if (!invoice.lines || !invoice.lines.length) return Promise.reject(new Error('Aucune ligne à facturer'));

        var pdfCid, certCid;
        // Ordre important : la page de certification est uploadée EN PREMIER
        // (elle ne référence pas le PDF) pour connaître cert_cid avant de
        // finaliser le PDF avec son lien de vérification — évite toute
        // dépendance circulaire entre les deux CIDs.
        return Promise.resolve()
            .then(function () {
                var certHtml = buildCertificationHtml(invoice, {});
                return uploadBlob(new Blob([certHtml], { type: 'text/html' }), invoice.invoice_id + '.cert.html');
            })
            .then(function (cid) {
                certCid = cid;
                var certUrl = _ipfsGateway() + '/ipfs/' + certCid;
                var doc = appendVerificationLink(buildPdf(invoice), certUrl);
                return uploadBlob(doc.output('blob'), invoice.invoice_id + '.pdf');
            })
            .then(function (cid) {
                pdfCid = cid;
                return Promise.all(invoice.lines.map(function (line) {
                    return publishBurnProof(invoice, line, 'PENDING', { pdf_cid: pdfCid, cert_cid: certCid });
                }));
            })
            .then(function (events) {
                return { pdf_cid: pdfCid, cert_cid: certCid, events: events };
            });
    }

    // ── Étape 2 (après POST /api/oc_admin/invoice/burn) : republie le statut
    // définitif par ligne en conservant pdf_cid/cert_cid — ZEN.INVOICE.sh publie
    // aussi son propre event OK/FAIL mais sans ces CID (il ne les connaît pas) ;
    // cette republication (même d_tag, event adressable) devient la version
    // faisant foi sur le relay.
    // burnResult = résultat JSON de POST /api/oc_admin/invoice/burn : {results:[
    //   {role, node_id, amount_zen, description, d_tag, status, expense_id?}, ...]}
    function finalizeAfterBurn(invoice, burnResult, cids) {
        var byKey = {};
        invoice.lines.forEach(function (l) { byKey[l.role + ':' + (l.node_id || '')] = l; });

        var results = (burnResult && burnResult.results) || [];
        return Promise.all(results.map(function (r) {
            var line = byKey[r.role + ':' + (r.node_id || '')];
            if (!line) return null; // ligne inconnue de cette facture — ignorée
            var status = r.status === 'ok' ? 'OK' : (r.status === 'burn_failed' ? 'FAIL' : 'FAIL');
            var extra = { pdf_cid: cids.pdf_cid, cert_cid: cids.cert_cid };
            if (r.expense_id) extra.expense_id = r.expense_id;
            if (r.status === 'burned_but_oc_failed') extra.oc_error = 'burned_but_oc_failed';
            return publishBurnProof(invoice, line, status, extra);
        }));
    }

    return {
        buildPdf: buildPdf,
        appendVerificationLink: appendVerificationLink,
        buildCertificationHtml: buildCertificationHtml,
        uploadBlob: uploadBlob,
        publishBurnProof: publishBurnProof,
        generateAndPublish: generateAndPublish,
        finalizeAfterBurn: finalizeAfterBurn,
        _dTag: _dTag, // exposé pour tests / affichage (oc_admin.html)
    };
})();

if (typeof window !== 'undefined') window.OCInvoicePDF = OCInvoicePDF;
