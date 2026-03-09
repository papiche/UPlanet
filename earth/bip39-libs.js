/**
 * bip39-libs.js — Remplace le bundle iancoleman pour keygen.html
 * Expose window.bip39 avec la même API qu'attendue.
 *
 * - Wordlists EN + FR embarquées en secours (partielles mais suffisantes pour dériver)
 * - Chargement automatique des listes COMPLÈTES depuis jsDelivr au démarrage
 * - Seed derivation (PBKDF2) fonctionne TOUJOURS, même sans liste complète
 *
 * IMPORTANT: mnemonicToSeedHex() retourne une PROMISE → await obligatoire.
 */
(function(root){
'use strict';

// ── SHA-256 sync (checksum mnemonic) ─────────────────────────────────────────
function rotr(x,n){return(x>>>n)|(x<<(32-n));}
function sha256(d){
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const l=d.length,pl=(l+9+63)&~63,m=new Uint8Array(pl);m.set(d);m[l]=0x80;
  const dv=new DataView(m.buffer);dv.setUint32(pl-4,(l*8)>>>0,false);dv.setUint32(pl-8,Math.floor(l*8/4294967296),false);
  const w=new Uint32Array(64);
  for(let i=0;i<pl;i+=64){
    for(let j=0;j<16;j++)w[j]=dv.getUint32(i+j*4,false);
    for(let j=16;j<64;j++){const s0=rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3),s1=rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10);w[j]=(w[j-16]+s0+w[j-7]+s1)>>>0;}
    let a=h0,b=h1,c=h2,dd=h3,e=h4,f=h5,g=h6,h=h7;
    for(let j=0;j<64;j++){const S1=(rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0,ch=((e&f)^(~e&g))>>>0,t1=(h+S1+ch+K[j]+w[j])>>>0,S0=(rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0,maj=((a&b)^(a&c)^(b&c))>>>0,t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(dd+t1)>>>0;dd=c;c=b;b=a;a=(t1+t2)>>>0;}
    h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+dd)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
  }
  const o=new Uint8Array(32),ov=new DataView(o.buffer);[h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i)=>ov.setUint32(i*4,v,false));return o;
}

// ── Helpers BIP39 ─────────────────────────────────────────────────────────────
function lp(s,n){while(s.length<n)s='0'+s;return s;}
function b2bin(b){return Array.from(b).map(x=>lp(x.toString(2),8)).join('');}
function bin2b(b){return parseInt(b,2);}
function csbits(e){return b2bin(sha256(e)).slice(0,e.length*8/32);}

// ── PBKDF2-SHA512 WebCrypto ───────────────────────────────────────────────────
async function pbkdf2(pw,salt){
  const e=new TextEncoder();
  const k=await crypto.subtle.importKey('raw',typeof pw==='string'?e.encode(pw):pw,'PBKDF2',false,['deriveBits']);
  const b=await crypto.subtle.deriveBits({name:'PBKDF2',salt:typeof salt==='string'?e.encode(salt):salt,iterations:2048,hash:'SHA-512'},k,512);
  return new Uint8Array(b);
}

// ── Wordlists ─────────────────────────────────────────────────────────────────
const WL = {};

// Embarquée EN (chargement CDN en parallèle)
WL.english = "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat body boil bomb bone book boost border boring borrow boss bottom bounce box boy bracket brain brand brave breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census chair chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle dad daily damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east easy echo ecology edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion employ empower empty enable enact endless endorse enemy energy enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal equip erase erosion error erupt escape essay essence estate eternal ethics evidence evil evolve exact example excess exchange excite exclude exercise exhaust exhibit exile exist exit exotic expand expire explain expose express extend extra eye fable face faculty fade faint faith fall false fame family famous fan fancy fantasy far fashion fat fatal father fatigue fault favorite feature february federal fee feed feel feet fellow felt fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grasp grass gravity great green grid grief grit grocery group grow grunt guard guide guilt guitar gun gym habit hair half hamster hand happy harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn hospital host hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon ignore ill illegal image imitate immense immune impact impose improve impulse inbox include income increase index indicate indoor industry infant inflict inform inhale inject inner innocent input inquiry insane insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab ladder lady lake lamp language laptop large later laugh laundry lava law lawn lawsuit layer lazy leader learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics magic magnet maid main major make mammal mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind minimum minor minute miracle miss misery mistake mix mixed mixture mobile model modify mom monitor monkey monster month moon moral more morning mosquito mother motion mold mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery naive name napkin narrow nasty natural nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north notable note nothing notice novel now nuclear nurse nut oak obey object oblige obscure obtain ocean october odor off offer office often oil okay old olive olympic omit once onion open option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor outside oval over own oyster ozone paddle page pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patrol pause pave payment peace peanut peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punish pupil purchase purpose push put puzzle pyramid queen quick quit quiz quote rabbit raccoon race rack radar radio rage rail rain raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling siege sight sign silent silk silly silver similar simple since sing siren sister situate six size sketch skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock solar soldier solid solution solve someone song soon sorry soul sound soup source south space spare spatial spawn speak special speed sphere spice spider spike spin spirit split spoil sponsor spoon spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach stone stop store stream street strike strong struggle student stuff stumble style subject submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise sustain swallow swamp swap swear sweet swift swim swing switch sword symbol symptom syrup table tackle tag tail talent tamper tank tape target task tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought three thrive throw thumb thunder ticket tilt timber time tiny tip tired title toast tobacco today together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy trade traffic tragic train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck truly trumpet trust truth tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban usage use used useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view village vintage violin viral virus visa visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding weekend weird welcome well west wet whale wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder wood wool word world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo".split(' ');

// Embarquée FR
WL.french = "abaisser abandon abdiquer abeille abolir aborder aboutir aboyer abrasif abreuver abriter abroger abrupt absence absolu absorber abstenir abstraire absurde abus académie accabler acclamer accolade accord accrocher accuser acerbe achat achever aciduler acier acquérir acrobate acteur actuel adepte adéquat adhésif adjectif adjoint admettre adopter adorer adoucir adresse adroit adulte adversaire aérer affable affaire afficher affliger agencer agile agiter agrafer agréable aguerrir aider aimable aise aléatoire algèbre aliéner aliment alléger allouer allumer altesse alumine amadouer amarrer ambigu amener amical amour ampleur amusant analyse anéantir animal annexer annonce anodin anonyme anticiper apaiser aplatir apporter arbitre ardeur argent armoire arpenter arracher arriver arroser asile asphyxie aspirer assener associer assurer atelier attentif attraper aubaine audace augmenter auparavant auteur automate avalanche avancer aveugle avide avoir bague baigner balancer ballon banal baptême barbare barbier barreau basculer bataille bâtiment battre bénéfice beurre bicyclette bienvenu bilan biologie blanchir blesser bloquer bouclier bouleau bouton branche brider brigade brillant broyer bureau cabanon cabrer calcaire calibre camarade campagne candidat caoutchouc capturer caresser carnaval carrousel cascade casserole causer cavalier cédille centuple certain cervelle chagrin chandail changer charbon charitable chasser chiffon circuit civique clarté clavier clinique clôture cobalt cochon coéquipier cognac colonie combiner comique commande compenser concert condamner confier congé conjonction conserver consigne contenu contorsion convenable corriger cosmique coton coucher coupable craindre créature créneau critique croiser cueillir cultiver daigner danseur déborder décaler déchirer défaire dégager déjouer déléguer demeure dénicher dépasser dériver désigner détacher dévaler développer devenir dicter digital dilemme discorde divertir domaine dominer douceur dresser durcir éblouir ébranler éclipse économie écraser effacer effort effrayer élaborer émettre émouvoir encadrer endiguer énergie enfoncer engager ennuyer enrichir envahir épaissir épargner équiper ériger éruption escompte espérer estimer éteindre étirer étudier évaluer exceller exclure exercice exister expansion extraire fabricant facette facile façonner facteur faiblesse falloir farouche fasciner fautif favori fédérer féroce figurer fixer fluide fondateur forger fortune fougueux fracture franchir freiner frémir frisson frivolité frustrer fumiste gardien général géranium glisser gonflé goudron gracieux grimper grossir guérison guetter habiller habiter harmonie heureux hiberner hiérarchie hivernal hommage horizon huile humidité illuminer illustrer immerger importer inadapté inclure indiquer inexact infime informer inhaler initier innover inscrire insister intégrer interagir intrépide inutile inverser isoler itinéraire jardiner jaunir jovial joyeux juguler kilomètre lacérer lancer légitime lenteur léviter libérer lier limpide lisible logique lointain luisant magnifier maintenir majesté majorer maltraiter marier maturité méfiance mélanger ménager mériter mesurer meubler miauler milieu minceur miracler modérer molécule montagne mordre motiver mouiller mouvant multiplier murmurer naviguer nébuleux nettoyer niveler nombril nommer notable nourrir novateur nuancer nuire obscurcir obtenir occuper octroyer offenser omettre opérer opposer optimiser osciller outiller oxyder pagaille papoter parachute pardonner parfumer partager patrouille paysage pêcheur pénétrer percevoir perturber peuplade piloter plafonner plaisir plonger pointer polir ponctuer portail postuler préciser prédire premier prestige primaire priver profiter progresser projeter prolonger promoteur propice proposer protéger provoquer purifier qualifier raccorder raffermir rallier ranimer réagir rebâtir recevoir réclamer recouvrir redonner réduire réfléchir régaler réguler rejeter remarquer remettre remplir renforcer renoncer rentabiliser réparer répliquer résoudre ressortir retracer réunir revêtir réviser rocher ronger saisir satisfaire sauvegarder sécuriser sembler séparer simplifier soigner sombrer songer sortir soutenir stabiliser stimuler stopper succéder surpasser sursauter surveiller survivre tâcher ternir tisser tolérer tonifier traiter traverser troubler unifier utiliser valoriser vanter végéter vérifier vibrer vouloir".split(' ');

// CDN pour autres langues + complétion EN/FR
const CDN = {
  english:             'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/english.json',
  french:              'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/french.json',
  spanish:             'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/spanish.json',
  italian:             'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/italian.json',
  portuguese:          'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/portuguese.json',
  czech:               'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/czech.json',
  japanese:            'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/japanese.json',
  chinese_simplified:  'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/chinese_simplified.json',
  chinese_traditional: 'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/chinese_traditional.json',
  korean:              'https://cdn.jsdelivr.net/npm/bip39@3.1.0/src/wordlists/korean.json',
};

const _loading = {};
async function loadWordlist(lang){
  if(WL[lang] && WL[lang].length===2048) return WL[lang];
  if(_loading[lang]) return _loading[lang];
  if(!CDN[lang]) throw new Error('Langue inconnue: '+lang);
  _loading[lang]=(async()=>{
    let words;
    const urls=[CDN[lang], CDN[lang].replace('cdn.jsdelivr.net/npm','unpkg.com')];
    for(const url of urls){
      try{
        const r=await fetch(url);
        if(!r.ok) continue;
        words=await r.json();
        if(Array.isArray(words)&&words.length===2048){WL[lang]=words;delete _loading[lang];return words;}
      }catch(e){/*try next*/}
    }
    // Fallback: si liste partielle embarquée, l'utiliser (seed OK, generate/validate risqué)
    if(WL[lang]){delete _loading[lang];console.warn('bip39: liste partielle pour '+lang+' ('+WL[lang].length+' mots)');return WL[lang];}
    delete _loading[lang];
    throw new Error('Impossible de charger la liste "'+lang+'"');
  })();
  return _loading[lang];
}

function listLanguages(){return Object.keys(CDN);}

async function init(lang){await loadWordlist(lang||'english');}

async function generateMnemonic(strength,lang){
  strength=strength||128;lang=lang||'english';
  const wl=await loadWordlist(lang);
  const e=new Uint8Array(strength/8);crypto.getRandomValues(e);
  const bits=b2bin(e)+csbits(e);
  return bits.match(/(.{1,11})/g).map(b=>wl[bin2b(b)]).join(' ');
}

async function validateMnemonic(mnemonic,lang){
  const words=mnemonic.normalize('NFKD').split(/\s+/);
  if(words.length%3!==0)return false;
  const langs=lang?[lang]:['english','french'];
  for(const l of langs){
    try{
      let wl;try{wl=await loadWordlist(l);}catch(e){continue;}
      const bits=words.map(w=>{const i=wl.indexOf(w);if(i===-1)throw 0;return lp(i.toString(2),11);}).join('');
      const div=Math.floor(bits.length/33)*32;
      const ent=new Uint8Array(bits.slice(0,div).match(/(.{1,8})/g).map(bin2b));
      if(csbits(ent)===bits.slice(div))return true;
    }catch(e){/*next*/}
  }
  return false;
}

async function mnemonicToSeed(mn,pw){
  const e=new TextEncoder();
  return pbkdf2(e.encode(mn.normalize('NFKD')),e.encode('mnemonic'+(pw||'').normalize('NFKD')));
}

/** ⚠️ ASYNC — doit être attendu avec await */
async function mnemonicToSeedHex(mn,pw){
  const s=await mnemonicToSeed(mn,pw);
  return Array.from(s).map(b=>('0'+b.toString(16)).slice(-2)).join('');
}

// ── Vérification des listes embarquées ────────────────────────────────────────
const _enLen=WL.english.length, _frLen=WL.french.length;
console.log('bip39-libs: EN embarqué '+_enLen+' mots / FR embarqué '+_frLen+' mots');
if(_enLen<2048) console.warn('bip39-libs: liste EN incomplète — chargement CDN en cours…');
if(_frLen<2048) console.warn('bip39-libs: liste FR incomplète — chargement CDN en cours…');

// Chargement CDN en arrière-plan dès le démarrage
Promise.all([loadWordlist('english'),loadWordlist('french')])
  .then(([en,fr])=>console.log('bip39-libs: listes complètes OK (EN:'+en.length+' FR:'+fr.length+')'))
  .catch(e=>console.warn('bip39-libs: chargement CDN échoué:',e.message));

// ── Export global ─────────────────────────────────────────────────────────────
root.bip39 = {
  init, listLanguages,
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  mnemonicToSeedHex,
  WORDLISTS: WL,
};

})(typeof self!=='undefined'?self:window);
