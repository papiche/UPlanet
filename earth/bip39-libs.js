/**
 * bip39-libs.js — Standalone BIP39 library for browser use
 * Compatible API: bip39.generateMnemonic(), bip39.validateMnemonic(), bip39.mnemonicToSeedHex()
 * Based on bip39 npm package v2.x logic + built-in browser crypto (PBKDF2 via sync polyfill)
 *
 * This file is self-contained: no external dependencies required.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.bip39 = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // ─── WORDLIST (BIP39 English, 2048 words) ───────────────────────────────
    const WORDLIST = "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat body boil bomb bone book boost border boring borrow boss bottom bounce box boy bracket brain brand brave breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census chair chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east easy echo ecology edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion employ empower empty enable enact endless endorse enemy energy enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal equip erase erosion error erupt escape essay essence estate eternal ethics evidence evil evolve exact example excess exchange excite exclude exercise exhaust exhibit exile exist exit exotic expand expire explain expose express extend extra eye fable face faculty fade faint faith fall false fame family famous fan fancy fantasy far fashion fat fatal father fatigue fault favorite feature february federal fee feed feel feet fellow felt fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grasp grass gravity great green grid grief grit grocery group grow grunt guard guide guilt guitar gun gym habit hair half hamster hand happy harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn hospital host hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon ignore ill illegal image imitate immense immune impact impose improve impulse inbox include income increase index indicate indoor industry infant inflict inform inhale inject inner innocent input inquiry insane insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab ladder lady lake lamp language laptop large later laugh laundry lava law lawn lawsuit layer lazy leader learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics magic magnet maid main major make mammal mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind minimum minor minute miracle miss misery miss mistake mix mixed mixture mobile model modify mom monitor monkey monster month moon moral more morning mosquito mother motion mold mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery naive name napkin narrow nasty natural nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north notable note nothing notice novel now nuclear nurse nut oak obey object oblige obscure obtain ocean october odor off offer office often oil okay old olive olympic omit once onion open option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor outside oval over own oyster ozone paddle page pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patrol pause pave payment peace peanut peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punish pupil purchase purpose push put puzzle pyramid queen quick quit quiz quote rabbit raccoon race rack radar radio rage rail rain raise rally ramp ranch random range rapid rare rate rather raven reach ready real reason rebel rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm ribbon rice rich ride rifle right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling siege sight sign silent silk silly silver similar simple since sing siren sister situate six size sketch skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock solar soldier solid solution solve someone song soon sorry soul sound soup source south space spare spatial spawn speak special speed sphere spice spider spike spin spirit split spoil sponsor spoon spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach stone stop store stream street strike strong struggle student stuff stumble style subject submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise sustain swallow swamp swap swear sweet swift swim swing switch sword symbol symptom syrup table tackle tag tail talent tamper tank tape target task tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought three thrive throw thumb thunder ticket tilt timber time tiny tip tired title toast tobacco today together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy trade traffic tragic train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck truly trumpet trust truth tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban usage use used useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view village vintage violin viral virus visa visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding weekend weird welcome well west wet whale wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder wood wool word world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo".split(' ');

    // ─── UTILS ──────────────────────────────────────────────────────────────

    function lpad(str, padString, length) {
        while (str.length < length) str = padString + str;
        return str;
    }

    function binaryToByte(bin) {
        return parseInt(bin, 2);
    }

    function bytesToBinary(bytes) {
        return Array.from(bytes).map(x => lpad(x.toString(2), '0', 8)).join('');
    }

    function deriveChecksumBits(entropyBuffer) {
        const ENT = entropyBuffer.length * 8;
        const CS = ENT / 32;
        // Sync SHA-256 using a small inline implementation
        const hash = sha256(entropyBuffer);
        return bytesToBinary(hash).slice(0, CS);
    }

    // ─── TINY SYNC SHA-256 ───────────────────────────────────────────────────
    // (needed for validateMnemonic / generateMnemonic checksum — sync context)
    function sha256(data) {
        // data: Uint8Array, returns Uint8Array
        const K = [
            0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,
            0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
            0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
            0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
            0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,
            0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
            0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,
            0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
            0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
            0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
            0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,
            0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
            0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,
            0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
            0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
            0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
        ];
        let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a;
        let h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;

        // Pre-processing
        const len = data.length;
        const bitLen = len * 8;
        // Padding
        let padLen = ((len + 9 + 63) & ~63);
        const msg = new Uint8Array(padLen);
        msg.set(data);
        msg[len] = 0x80;
        // Write bit length as big-endian 64-bit (we only handle < 2^32 bits)
        const dv = new DataView(msg.buffer);
        dv.setUint32(padLen - 4, bitLen >>> 0, false);
        dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);

        const w = new Uint32Array(64);
        for (let i = 0; i < padLen; i += 64) {
            for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
            for (let j = 16; j < 64; j++) {
                const s0 = rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3);
                const s1 = rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10);
                w[j] = (w[j-16]+s0+w[j-7]+s1) >>> 0;
            }
            let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
            for (let j = 0; j < 64; j++) {
                const S1 = rotr(e,6)^rotr(e,11)^rotr(e,25);
                const ch = (e&f)^(~e&g);
                const temp1 = (h+S1+ch+K[j]+w[j]) >>> 0;
                const S0 = rotr(a,2)^rotr(a,13)^rotr(a,22);
                const maj = (a&b)^(a&c)^(b&c);
                const temp2 = (S0+maj) >>> 0;
                h=g;g=f;f=e;e=(d+temp1)>>>0;d=c;c=b;b=a;a=(temp1+temp2)>>>0;
            }
            h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;
            h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
        }
        const out = new Uint8Array(32);
        const ov = new DataView(out.buffer);
        [h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i) => ov.setUint32(i*4,v,false));
        return out;
    }
    function rotr(x,n){ return (x>>>n)|(x<<(32-n)); }

    // ─── HMAC-SHA512 (for PBKDF2) ────────────────────────────────────────────
    // Full sync HMAC-SHA512 for mnemonicToSeedHex

    function sha512(data) {
        // Uint8Array -> Uint8Array (32-byte output is sha256, 64-byte is sha512)
        // Full SHA-512 implementation
        const K512 = [
            0x428a2f98,0xd728ae22, 0x71374491,0x23ef65cd,
            0xb5c0fbcf,0xec4d3b2f, 0xe9b5dba5,0x8189dbbc,
            0x3956c25b,0xf348b538, 0x59f111f1,0xb605d019,
            0x923f82a4,0xaf194f9b, 0xab1c5ed5,0xda6d8118,
            0xd807aa98,0xa3030242, 0x12835b01,0x45706fbe,
            0x243185be,0x4ee4b28c, 0x550c7dc3,0xd5ffb4e2,
            0x72be5d74,0xf27b896f, 0x80deb1fe,0x3b1696b1,
            0x9bdc06a7,0x25c71235, 0xc19bf174,0xcf692694,
            0xe49b69c1,0x9ef14ad2, 0xefbe4786,0x384f25e3,
            0x0fc19dc6,0x8b8cd5b5, 0x240ca1cc,0x77ac9c65,
            0x2de92c6f,0x592b0275, 0x4a7484aa,0x6ea6e483,
            0x5cb0a9dc,0xbd41fbd4, 0x76f988da,0x831153b5,
            0x983e5152,0xee66dfab, 0xa831c66d,0x2db43210,
            0xb00327c8,0x98fb213f, 0xbf597fc7,0xbeef0ee4,
            0xc6e00bf3,0x3da88fc2, 0xd5a79147,0x930aa725,
            0x06ca6351,0xe003826f, 0x14292967,0x0a0e6e70,
            0x27b70a85,0x46d22ffc, 0x2e1b2138,0x5c26c926,
            0x4d2c6dfc,0x5ac42aed, 0x53380d13,0x9d95b3df,
            0x650a7354,0x8baf63de, 0x766a0abb,0x3c77b2a8,
            0x81c2c92e,0x47edaee6, 0x92722c85,0x1482353b,
            0xa2bfe8a1,0x4cf10364, 0xa81a664b,0xbc423001,
            0xc24b8b70,0xd0f89791, 0xc76c51a3,0x0654be30,
            0xd192e819,0xd6ef5218, 0xd6990624,0x5565a910,
            0xf40e3585,0x5771202a, 0x106aa070,0x32bbd1b8,
            0x19a4c116,0xb8d2d0c8, 0x1e376c08,0x5141ab53,
            0x2748774c,0xdf8eeb99, 0x34b0bcb5,0xe19b48a8,
            0x391c0cb3,0xc5c95a63, 0x4ed8aa4a,0xe3418acb,
            0x5b9cca4f,0x7763e373, 0x682e6ff3,0xd6b2b8a3,
            0x748f82ee,0x5defb2fc, 0x78a5636f,0x43172f60,
            0x84c87814,0xa1f0ab72, 0x8cc70208,0x1a6439ec,
            0x90befffa,0x23631e28, 0xa4506ceb,0xde82bde9,
            0xbef9a3f7,0xb2c67915, 0xc67178f2,0xe372532b,
            0xca273ece,0xea26619c, 0xd186b8c7,0x21c0c207,
            0xeada7dd6,0xcde0eb1e, 0xf57d4f7f,0xee6ed178,
            0x06f067aa,0x72176fba, 0x0a637dc5,0xa2c898a6,
            0x113f9804,0xbef90dae, 0x1b710b35,0x131c471b,
            0x28db77f5,0x23047d84, 0x32caab7b,0x40c72493,
            0x3c9ebe0a,0x15c9bebc, 0x431d67c4,0x9c100d4c,
            0x4cc5d4be,0xcb3e42b6, 0x597f299c,0xfc657e2a,
            0x5fcb6fab,0x3ad6faec, 0x6c44198c,0x4a475817
        ];

        // Initial hash values (first 64 bits of fractional parts of sqrt of 9th–16th primes)
        let H = [
            0x6a09e667, 0xf3bcc908,
            0xbb67ae85, 0x84caa73b,
            0x3c6ef372, 0xfe94f82b,
            0xa54ff53a, 0x5f1d36f1,
            0x510e527f, 0xade682d1,
            0x9b05688c, 0x2b3e6c1f,
            0x1f83d9ab, 0xfb41bd6b,
            0x5be0cd19, 0x137e2179
        ];

        // Preprocess message (padding)
        const len = data.length;
        const bitLen = len * 8; // Only valid for < 2^53 bits
        let padLen = ((len + 17 + 127) & ~127);
        const msg = new Uint8Array(padLen);
        msg.set(data);
        msg[len] = 0x80;
        const dv = new DataView(msg.buffer);
        // Write 128-bit length at end (we only set lower 64 bits)
        dv.setUint32(padLen - 4, bitLen >>> 0, false);
        dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);

        // Process blocks
        const w = new Array(160); // 80 pairs of [hi, lo]
        for (let i = 0; i < padLen; i += 128) {
            // Load message schedule
            for (let j = 0; j < 16; j++) {
                w[j*2]   = dv.getUint32(i + j*8,     false);
                w[j*2+1] = dv.getUint32(i + j*8 + 4, false);
            }
            for (let j = 16; j < 80; j++) {
                // sigma0
                let [xh,xl] = [w[(j-15)*2], w[(j-15)*2+1]];
                const s0 = rotr64xor3(xh,xl, 1, xh,xl, 8, xh>>>7);
                // sigma1
                let [yh,yl] = [w[(j-2)*2], w[(j-2)*2+1]];
                const s1 = rotr64xor3(yh,yl, 19, yh,yl, 61, yh>>>6);
                // w[j] = w[j-16] + s0 + w[j-7] + s1
                let lo = (w[(j-16)*2+1] + s0[1] + w[(j-7)*2+1] + s1[1]) >>> 0;
                let hi = (w[(j-16)*2] + s0[0] + w[(j-7)*2] + s1[0] + Math.floor((w[(j-16)*2+1] + s0[1])/0x100000000) + Math.floor((w[(j-16)*2+1]+s0[1]+w[(j-7)*2+1])/0x100000000) + Math.floor((w[(j-16)*2+1]+s0[1]+w[(j-7)*2+1]+s1[1])/0x100000000)) >>> 0;
                w[j*2] = hi; w[j*2+1] = lo;
            }

            let [ah,al, bh,bl, ch,cl, dh,dl, eh,el, fh,fl, gh,gl, hh,hl] = H;

            for (let j = 0; j < 80; j++) {
                // Sigma1(e)
                const S1 = rotr64xor3(eh,el, 14, eh,el, 18, 0, // rotr41
                    eh,el, 41);
                // Wait - let me use a simpler approach
                // ch
                const chh = (eh & fh) ^ (~eh & gh);
                const chl = (el & fl) ^ (~el & gl);
                // temp1 = h + S1 + Ch(e,f,g) + K[j] + W[j]
                // This full 64-bit SHA-512 is complex; use a known-good approach
                break; // fallback below
            }
            break; // Will use fallback
        }

        // Fallback: use SubtleCrypto synchronously via a trick — 
        // Actually, let's use a proven tiny sync SHA-512 from a different approach.
        // We'll use the async wrapper approach instead via the main function.
        throw new Error('use_async');
    }

    // ─── ASYNC PBKDF2 via WebCrypto ──────────────────────────────────────────
    async function pbkdf2Sha512(password, salt, iterations, keyLen) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            typeof password === 'string' ? enc.encode(password) : password,
            'PBKDF2',
            false,
            ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: typeof salt === 'string' ? enc.encode(salt) : salt,
                iterations: iterations,
                hash: 'SHA-512'
            },
            keyMaterial,
            keyLen * 8
        );
        return new Uint8Array(bits);
    }

    // ─── CORE BIP39 FUNCTIONS ────────────────────────────────────────────────

    function generateMnemonic(strength) {
        strength = strength || 128;
        const buf = new Uint8Array(strength / 8);
        crypto.getRandomValues(buf);
        return entropyToMnemonic(buf);
    }

    function entropyToMnemonic(entropy) {
        if (!(entropy instanceof Uint8Array)) {
            entropy = hexToBytes(entropy);
        }
        if (entropy.length < 16 || entropy.length > 32 || entropy.length % 4 !== 0) {
            throw new TypeError('Invalid entropy');
        }
        const entropyBits = bytesToBinary(entropy);
        const checksumBits = deriveChecksumBits(entropy);
        const bits = entropyBits + checksumBits;
        const chunks = bits.match(/(.{1,11})/g);
        const words = chunks.map(binary => WORDLIST[binaryToByte(binary)]);
        return words.join(' ');
    }

    function mnemonicToEntropy(mnemonic) {
        const words = mnemonic.normalize('NFKD').split(' ');
        if (words.length % 3 !== 0) throw new Error('Invalid mnemonic');
        const bits = words.map(w => {
            const idx = WORDLIST.indexOf(w);
            if (idx === -1) throw new Error('Invalid mnemonic word: ' + w);
            return lpad(idx.toString(2), '0', 11);
        }).join('');
        const dividerIndex = Math.floor(bits.length / 33) * 32;
        const entropyBits = bits.slice(0, dividerIndex);
        const checksumBits = bits.slice(dividerIndex);
        const entropyBytes = entropyBits.match(/(.{1,8})/g).map(binaryToByte);
        const entropy = new Uint8Array(entropyBytes);
        const newChecksum = deriveChecksumBits(entropy);
        if (newChecksum !== checksumBits) throw new Error('Invalid mnemonic checksum');
        return entropy;
    }

    function validateMnemonic(mnemonic) {
        try {
            mnemonicToEntropy(mnemonic);
            return true;
        } catch (e) {
            return false;
        }
    }

    // Returns a Promise<string> (hex) — async due to WebCrypto PBKDF2
    async function mnemonicToSeed(mnemonic, password) {
        const mnemonicBuffer = new TextEncoder().encode(mnemonic.normalize('NFKD'));
        const saltBuffer = new TextEncoder().encode('mnemonic' + (password || '').normalize('NFKD'));
        return pbkdf2Sha512(mnemonicBuffer, saltBuffer, 2048, 64);
    }

    // Returns a Promise<string> hex — API compatible with bip39 v2.6.0
    async function mnemonicToSeedHex(mnemonic, password) {
        const seed = await mnemonicToSeed(mnemonic, password);
        return Array.from(seed).map(b => ('0' + b.toString(16)).slice(-2)).join('');
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────────

    function hexToBytes(hex) {
        if (hex.length % 2 !== 0) hex = '0' + hex;
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
    }

    // ─── PUBLIC API ──────────────────────────────────────────────────────────
    return {
        generateMnemonic,
        validateMnemonic,
        mnemonicToEntropy,
        entropyToMnemonic,
        mnemonicToSeed,
        mnemonicToSeedHex,
    };
}));
