/**
 * The XMS commercial, authored once and built twice (English, Swahili).
 *
 * ## The creative
 *
 * Problem -> feeling -> solution -> proof -> features -> action.
 *
 * The hook is the one experience every single person in the target market has
 * had: you press send and nothing happens, because the bundle is finished, or
 * you have driven past the edge of the data network, or the network is simply
 * down. Every other messenger on the phone is a data app and has no answer to
 * it. XMS does, and that is the sale.
 *
 * ## The rule this film is written to
 *
 * **Everything on screen is something a user can SEE, and check.** Not one
 * claim here is about internals. The film shows screens, settings and
 * behaviour -- the chat, the hidden bubbles, the app lock, the starred list,
 * the QR card, the SIM chip, the permission list -- all drawn from the app's
 * own UI, and in the app's own words (`app/src/main/res/values/strings.xml`:
 * "Private encrypted SMS", "Plain text SMS", "Keep messages hidden",
 * "Starred messages", "App lock", "Scan a contact's QR", "Send with which
 * SIM?").
 *
 * The strongest scene in the film is `proof`, and it is strong precisely
 * because it asks for no trust at all: XMS does not hold the INTERNET
 * permission. Not "we promise we do not upload"; the app cannot. A viewer can
 * open their own phone's app settings, or the Play listing, and see it in ten
 * seconds. That is a verifiable fact doing the work an adjective usually
 * fails to do.
 *
 * ## What is deliberately NOT in the film
 *
 * - Anything about how it works. No cipher, no keys, no segmentation, no
 *   reassembly, no storage design. A competitor watching this learns what the
 *   app is for and nothing about how to rebuild it.
 * - Absolutes. Nothing says unbreakable, military-grade, or that nobody can
 *   ever read anything -- `xms/ROADMAP.md` commits the product against that
 *   language, and a claim that collapses on inspection costs more than it
 *   earns.
 * - Attachments. The paperclip's tiles are "Coming soon" placeholders, so
 *   images are not advertised.
 *
 * Roughly 1:55 in English, shorter in Swahili.
 */
import {
    FONT, L, M, build, conceal, effect, pathPart, pop, reveal, textPart,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, META, XMS_PALETTE, offstage, says, vo, voicesFor,
} from '../lib/xms.mjs';
import {
    banParts, bannerParts, board, bubbleParts, cardRows, castBoard, chipParts,
    contactCardParts, convRowParts, endCard, fitShots, hiddenBubbleParts, hookTitle,
    lockParts, phoneParts, qrParts, roundRectC, signalParts, titleAt,
} from './common.mjs';

// ---------------------------------------------------------------------------
// The narration. Indexed, so a rewrite is one edit and not three.
// ---------------------------------------------------------------------------

const P = {
    en: [
        /* 0  HOOK   */ 'You wrote it. You pressed send. And it just sat there.',
        /* 1         */ 'No internet. Of course — the one message that mattered.',
        /* 2  WHY    */ 'It is always one of three. The bundle finishes.',
        /* 3         */ 'You travel past the edge of the data network.',
        /* 4         */ 'Or the network goes down.',
        /* 5  NEEMA  */ 'I only wanted to say I had arrived safely.',
        /* 6  HOST   */ 'So we built a messenger that does not need it.',
        /* 7  BRAND  */ 'XMS sends your message over the ordinary mobile network.',
        /* 8         */ 'No bundle. No account to open. Just send.',
        /* 9  SEND   */ 'Turn your data off completely. It still goes.',
        /*10  JUMA   */ 'It arrived. And I have no data either.',
        /*11         */ 'One bar of signal is enough, and a short message is one text.',
        /*12  PLAIN  */ 'Now — not everyone has XMS yet.',
        /*13         */ 'Send them a private message, and this is what reaches them.',
        /*14         */ 'So switch that chat to plain text. Or send them the app.',
        /*15  MODES  */ 'One app for both. Private to XMS. Plain to everyone else.',
        /*16         */ 'One chip at the bottom of every chat. It remembers, per person.',
        /*17  QR     */ 'Adding someone needs no typing at all.',
        /*18         */ 'Scan their code, and their number and details are in your phone.',
        /*19  HIDE   */ 'Your messages stay hidden until you tap them.',
        /*20  LOCK   */ 'Open it with your fingerprint. Screenshots blocked. Nothing to copy out.',
        /*21  MORE   */ 'Star the ones you need again — codes, addresses, account numbers.',
        /*22         */ 'Choose which SIM sends. Make the whole thing yours.',
        /*23  START  */ 'Three steps.',
        /*24         */ 'Install it free from Google Play. Make it your messaging app. Then '
            + 'send.',
        /*25  CARD   */ 'XMS, on Google Play. Your message goes — bundle or no bundle.',
    ],
    sw: [
        /* 0  */ 'Uliandika. Ukabonyeza tuma. Ukabaki kusubiri.',
        /* 1  */ 'Hakuna intaneti. Na ndio ujumbe uliokuwa wa muhimu kuliko yote.',
        /* 2  */ 'Daima ni mojawapo ya matatu. Bando linaisha.',
        /* 3  */ 'Umepita mpaka wa mtandao wa data.',
        /* 4  */ 'Au mtandao umekatika.',
        /* 5  */ 'Nilitaka tu kusema nimefika salama.',
        /* 6  */ 'Ndiyo maana tumetengeneza app isiyohitaji intaneti.',
        /* 7  */ 'XMS inatuma ujumbe wako kupitia mtandao wa kawaida wa simu.',
        /* 8  */ 'Bila bando. Bila akaunti ya kufungua. Tuma tu.',
        /* 9  */ 'Zima data yako kabisa. Ujumbe bado unaenda.',
        /*10  */ 'Umefika. Na mimi pia sina data.',
        /*11  */ 'Mstari mmoja wa mtandao unatosha, na ujumbe mfupi ni SMS moja.',
        /*12  */ 'Sasa — si kila mtu ana XMS bado.',
        /*13  */ 'Mtumie ujumbe wa siri, na hiki ndicho kinachomfikia.',
        /*14  */ 'Kwa hiyo badilisha mazungumzo hayo kuwa SMS ya kawaida. Au mtumie app '
            + 'yenyewe.',
        /*15  */ 'App moja kwa yote. Siri kwa XMS. Kawaida kwa wengine wote.',
        /*16  */ 'Kibonyezo kimoja chini ya kila mazungumzo. Kinakumbuka, kwa kila mtu.',
        /*17  */ 'Kumwongeza mtu hakuhitaji kuandika chochote.',
        /*18  */ 'Skani msimbo wake, na namba na taarifa zake zinaingia kwenye simu yako.',
        /*19  */ 'Ujumbe wako unabaki umefichwa mpaka uuguse.',
        /*20  */ 'Ifungue kwa kidole chako. Picha za skrini zimezuiwa. Hakuna cha kunakiliwa.',
        /*21  */ 'Tia nyota unazozihitaji tena — misimbo, anwani, namba za akaunti.',
        /*22  */ 'Chagua SIM itakayotuma. Ifanye yote kuwa yako.',
        /*23  */ 'Hatua tatu.',
        /*24  */ 'Isakinishe bure kutoka Google Play. Ifanye kuwa app yako ya ujumbe. Kisha '
            + 'tuma.',
        /*25  */ 'XMS, kwenye Google Play. Ujumbe wako unaenda — bando au bila bando.',
    ],
};

/**
 * On-screen copy: everything drawn rather than spoken.
 *
 * Where the app has its own word for something, the film uses the app's word.
 * A viewer who installs it should find the same labels they just watched.
 */
const T = {
    en: {
        kicker: 'SOMETHING EVERYONE HAS DONE',
        title: 'It did not send.',
        chatWith: 'Juma',
        chatBack: 'Neema',
        recv1: 'You there?',
        sent1: 'I have arrived safely',
        failed: 'Not delivered',
        reply: 'Got it, thanks',
        modeChip: 'Private encrypted SMS',
        plainChip: 'Plain text SMS',
        simChip: 'SIM 1',
        hintTxt: 'Type a message…',
        // What a phone WITHOUT XMS shows. Drawn from the wire alphabet
        // (letters, digits and punctuation) but carrying no real frame
        // header, so the film says "unreadable" without publishing anything.
        garble: 'Kw7#Qp2mZ!vLx9$Ht3Rb\n:Xd8/Ns6=Yc1@Jf4%Gu0',
        plainH: 'If they do not have XMS yet',
        theirPhone: 'Their phone  ·  no XMS',
        plainFix: 'Switched to: Plain text SMS',
        unknown: '+255 712 000 123',
        qrH: 'Scan. Added.',
        qrSub: 'Point the camera at another XMS contact code',
        cardName: 'Juma Mwangi',
        cardPhone: '+255 712 000 123',
        cardWork: 'Splannes Company Ltd',
        noNet: 'No internet connection',
        whyH: 'Why it did not go',
        why: [
            ['The bundle finished', 'At the worst possible moment, and the shop is shut.'],
            ['Signal, but no data', 'You travelled past the edge of the data network.'],
            ['The network went down', 'The whole area. The whole afternoon.'],
        ],
        brand: ['No bundle needed.', 'No account.', 'Just send.'],
        dataOff: 'Mobile data  ·  OFF',
        delivered: 'Delivered',
        proof: 'No data. Delivered anyway.',
        bothEnds: 'Both ends. No data.',
        modeH: 'It becomes your texting app',
        rows: [
            ['Juma', 'I have arrived safely', 'Private encrypted SMS'],
            ['Mama', 'Nitakuja kesho', 'Plain text SMS'],
        ],
        modeFoot: 'One switch, per chat.',
        hideH: 'Hidden until you tap',
        lockChip: 'Fingerprint or PIN to open',
        lockLines: ['Screenshots blocked.', 'Nothing to copy out.'],
        moreH: 'And the small things that matter',
        more: [
            ['Starred messages', 'Long-press to star. Find them in one tap.'],
            ['Dual SIM', 'A SIM chip in the chat picks which one sends.'],
            ['Make it yours', 'Dark or light, high contrast, bigger text, your background.'],
        ],
        startH: 'Three steps',
        steps: [
            ['1   Install XMS', 'Free on Google Play. Android.'],
            ['2   Make it your messaging app', 'One tap, when it asks.'],
            ['3   Add your person', 'Scan their code, or pick them from contacts.'],
        ],
    },
    sw: {
        kicker: 'JAMBO AMBALO SOTE TUMELIPITIA',
        title: 'Haikutumwa.',
        chatWith: 'Juma',
        chatBack: 'Neema',
        recv1: 'Umefika?',
        sent1: 'Nimefika salama',
        failed: 'Haijafika',
        reply: 'Nimepata, asante',
        modeChip: 'SMS ya siri',
        plainChip: 'SMS ya kawaida',
        simChip: 'SIM 1',
        hintTxt: 'Andika ujumbe…',
        garble: 'Kw7#Qp2mZ!vLx9$Ht3Rb\n:Xd8/Ns6=Yc1@Jf4%Gu0',
        plainH: 'Kama hana XMS bado',
        theirPhone: 'Simu yake  ·  bila XMS',
        plainFix: 'Imebadilishwa: SMS ya kawaida',
        unknown: '+255 712 000 123',
        qrH: 'Skani. Ameongezwa.',
        qrSub: 'Elekeza kamera kwenye msimbo wa mtumiaji mwingine wa XMS',
        cardName: 'Juma Mwangi',
        cardPhone: '+255 712 000 123',
        cardWork: 'Splannes Company Ltd',
        noNet: 'Hakuna intaneti',
        whyH: 'Kwa nini haikuenda',
        why: [
            ['Bando limeisha', 'Wakati mbaya kabisa, na duka limefungwa.'],
            ['Mtandao upo, data hapana', 'Umepita mpaka wa mtandao wa data.'],
            ['Mtandao umekatika', 'Eneo zima. Mchana mzima.'],
        ],
        brand: ['Hakuna bando linalohitajika.', 'Bila akaunti.', 'Tuma tu.'],
        dataOff: 'Data ya simu  ·  IMEZIMWA',
        delivered: 'Imefika',
        proof: 'Bila data. Imefika vilevile.',
        bothEnds: 'Wote wawili. Bila data.',
        modeH: 'Inakuwa app yako ya ujumbe',
        rows: [
            ['Juma', 'Nimefika salama', 'SMS ya siri'],
            ['Mama', 'Nitakuja kesho', 'SMS ya kawaida'],
        ],
        modeFoot: 'Kibonyezo kimoja, kwa kila mazungumzo.',
        hideH: 'Yamefichwa mpaka uguse',
        lockChip: 'Kidole au PIN kufungua',
        lockLines: ['Picha za skrini zimezuiwa.', 'Hakuna cha kunakili.'],
        moreH: 'Na mambo madogo yenye maana',
        more: [
            ['Ujumbe wa nyota', 'Bonyeza kwa muda kutia nyota. Uipate kwa mguso mmoja.'],
            ['SIM mbili', 'Kibonyezo cha SIM kwenye mazungumzo huchagua itumayo.'],
            ['Ifanye yako', 'Giza au mwanga, maandishi makubwa, mandhari yako.'],
        ],
        startH: 'Hatua tatu',
        steps: [
            ['1   Sakinisha XMS', 'Bure kwenye Google Play. Android.'],
            ['2   Ifanye app yako ya ujumbe', 'Bonyeza mara moja itakapouliza.'],
            ['3   Mwongeze mtu wako', 'Skani msimbo wake, au mchague kwenye namba zako.'],
        ],
    },
};

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** Scene 1: the message that would not go. */
function boardHook(t) {
    const ph = phoneParts('p', { title: t.chatWith, mode: t.modeChip, hint: t.hintTxt });
    const s = ph.screen;
    const b1 = bubbleParts('h1', t.recv1, { screen: s, top: ph.top, w: 250, side: 'left' });
    const b2 = bubbleParts('h2', t.sent1, { screen: s, top: b1.bottom + 40, w: 330 });
    const ban = banParts('hban', [s.x0 + 38, b2.cy], { r: 27, strokeWidth: 7 });
    const chip = chipParts('hchip', t.noNet,
        { at: [540, 1382], fill: '#2a1012', stroke: '#6e2a24', textFill: 'fail' });
    const parts = [
        ...ph.parts, ...b1.parts, ...b2.parts, ...ban,
        textPart('hfail', t.failed, {
            at: [s.x1 - 16, b2.bottom + 26], font: `600 23px ${FONT}`, fill: 'fail',
            align: 'right', z: 30, maxWidth: 300 }),
        ...chip.parts,
        ...hookTitle(t.kicker, t.title),
    ];
    // The handset is up from the first frame; only what happens ON it builds.
    for (const x of parts) if (ph.ids.includes(x.id)) x.alpha = 1;
    return { ...board('hook', parts), b1, b2, banIds: ban.map((x) => x.id), chip };
}

/**
 * Scene 3: her message, alone on screen.
 *
 * This replaces a staged shot of a character holding a phone. `generate`
 * builds a RIGID CUTOUT rig -- flat fills, a seam at every joint, no
 * deformation (docs/11-MOTION-SYSTEM.md, "Still missing"). Framed wide it
 * reads as clip-art; framed close, which is what this line needs, the seams
 * read worse rather than better. An advert is judged on its weakest frame, so
 * the figure comes out and the VOICE stays: Neema still speaks the line, now
 * over her own undelivered message.
 */
function boardNote(t) {
    return board('note', [
        pathPart('nb', roundRectC(540, 846, 800, 168, [34, 34, 10, 34]),
                 { fill: 'sent', alpha: 0, z: 20 }),
        textPart('nt', t.sent1, { at: [540, 850], font: `800 50px ${FONT}`, fill: 'sentInk',
                                  alpha: 0, z: 21, maxWidth: 700 }),
        textPart('nf', t.failed, { at: [540, 980], font: `700 34px ${FONT}`, fill: 'fail',
                                   alpha: 0, z: 21, maxWidth: 700 }),
        ...banParts('nban', [540, 1116], { r: 46, strokeWidth: 9 })
            .map((x) => ({ ...x, alpha: 0 })),
    ]);
}

/** Scene 2: the three reasons, as cards. */
function boardWhy(t) {
    const rows = cardRows('wr', t.why.map(([a, b]) => [a, b, XMS_PALETTE.blue]),
                          { top: 622, h: 176, gap: 22 });
    return { ...board('why', [
        textPart('h', t.whyH, { at: [540, 546], font: `800 42px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

/** Scene 4: the wordmark and the three denials. */
function boardBrand(t) {
    const lines = t.brand.map((text, i) => textPart(`bl${i}`, text, {
        at: [540, 904 + i * 92], font: `800 50px ${FONT}`, fill: 'ink', alpha: 0, z: 60,
        maxWidth: 940 }));
    return { ...board('brand', [
        textPart('wm', 'XMS', { at: [540, 686], font: `800 156px ${FONT}`, fill: 'blue',
                                alpha: 0, z: 60 }),
        pathPart('wmrule', 'M380,772 L700,772', { stroke: 'outline', strokeWidth: 2,
                                                  alpha: 0, z: 60 }),
        ...lines,
    ]), lineIds: lines.map((x) => x.id) };
}

/** Scene 5: data off, and it goes anyway. */
function boardSend(t) {
    const ph = phoneParts('q', { title: t.chatWith, mode: t.modeChip, hint: t.hintTxt });
    const s = ph.screen;
    const b1 = bubbleParts('s1', t.recv1, { screen: s, top: ph.top, w: 250, side: 'left' });
    const b2 = bubbleParts('s2', t.sent1, { screen: s, top: b1.bottom + 40, w: 330 });
    // Juma's reply, so his line lands as a message rather than a talking rig.
    const b3 = bubbleParts('s3', t.reply, { screen: s, top: b2.bottom + 58, w: 290,
                                            side: 'left' });
    const sig = signalParts('sig', [s.x0 + 26, b3.bottom + 108], { lit: 1, live: 'good' });
    const off = chipParts('soff', t.dataOff,
        { at: [540, 1382], fill: '#2a1012', stroke: '#6e2a24', textFill: 'fail' });
    const ok = chipParts('sok', t.proof,
        { at: [540, 1382], fill: '#0d2a1c', stroke: '#1f6b47', textFill: 'good' });
    const parts = [
        ...ph.parts, ...b1.parts, ...b2.parts, ...b3.parts,
        textPart('sdel', `✓  ${t.delivered}`, {
            at: [s.x1 - 16, b2.bottom + 26], font: `700 23px ${FONT}`, fill: 'good',
            align: 'right', z: 30, maxWidth: 300 }),
        ...sig.parts, ...off.parts, ...ok.parts,
    ];
    for (const x of parts) if (ph.ids.includes(x.id)) x.alpha = 1;
    return { ...board('send', parts), b1, b2, b3, sig, off, ok };
}

/**
 * Scene 6: what reaches someone who has NOT got XMS.
 *
 * The scene the owner asked for, and the one an advert would normally hide.
 * It is in because it answers the question every viewer will ask before
 * installing -- "what happens to the people I text who do not have it?" --
 * and because the answer is good: switch the chip, and they get an ordinary
 * SMS. It also motivates the share, which no amount of asking does.
 *
 * The garbled text is drawn from the wire alphabet (letters, digits,
 * punctuation) and carries NO real frame header, so the film shows
 * "unreadable" without publishing anything about the format.
 */
function boardPlain(t) {
    // A stock messaging app: no mode chip, no SIM chip, a neutral send button.
    const ph = phoneParts('u', { title: t.unknown, plain: true, hint: t.hintTxt,
                                 surface: 'surface', screen: 'screen' });
    const s = ph.screen;
    const g = bubbleParts('pg', t.garble, { screen: s, top: ph.top + 10, w: 330,
                                            side: 'left', lines: 2,
                                            font: `600 25px ${FONT}`, lineHeight: 32 });
    const fixed = bubbleParts('pf', t.sent1, { screen: s, top: g.bottom + 104, w: 330,
                                               side: 'left' });
    const their = chipParts('pth', t.theirPhone,
        { at: [540, 1382], fill: '#2a1012', stroke: '#6e2a24', textFill: 'fail' });
    const fix = chipParts('pfx', t.plainFix,
        { at: [540, 1382], fill: '#0d2a1c', stroke: '#1f6b47', textFill: 'good' });
    const parts = [
        ...ph.parts, ...g.parts, ...fixed.parts,
        textPart('ph_h', t.plainH, { at: [540, 420], font: `800 44px ${FONT}`, fill: 'ink',
                                     alpha: 0, z: 60, maxWidth: 940 }),
        // The arrow between the two states, so the fix reads as a change.
        pathPart('ph_ar', `${M(s.x0 + 60, g.bottom + 44)} ${L(s.x0 + 60, g.bottom + 86)} `
            + `${L(s.x0 + 48, g.bottom + 70)} ${M(s.x0 + 60, g.bottom + 86)} `
            + `${L(s.x0 + 72, g.bottom + 70)}`,
            { stroke: 'good', strokeWidth: 5, alpha: 0, z: 40, lineCap: 'round' }),
        ...their.parts, ...fix.parts,
    ];
    for (const x of parts) if (ph.ids.includes(x.id)) x.alpha = 1;
    return { ...board('plain', parts), g, fixed, their, fix };
}

/** Scene 7: one app, both kinds of message. */
function boardModes(t) {
    const r1 = convRowParts('cr0', { name: t.rows[0][0], preview: t.rows[0][1],
                                     avatar: 'av1', cy: 712 });
    const r2 = convRowParts('cr1', { name: t.rows[1][0], preview: t.rows[1][1],
                                     avatar: 'av7', cy: 894, badge: '2' });
    // The chip pair, drawn at the size the chat screen actually shows them.
    const mc = chipParts('mm', t.modeChip,
        { at: [386, 1066], font: `600 25px ${FONT}`, fill: 'surface', stroke: 'blue',
          textFill: 'ink', h: 50 });
    const pc = chipParts('mp', t.plainChip,
        { at: [760, 1066], font: `600 25px ${FONT}`, fill: 'surface', stroke: 'outline',
          textFill: 'dim', h: 50 });
    return { ...board('modes', [
        textPart('h', t.modeH, { at: [540, 556], font: `800 44px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60, maxWidth: 940 }),
        ...r1.parts, ...r2.parts, ...mc.parts, ...pc.parts,
        textPart('foot', t.modeFoot, { at: [540, 1172], font: `700 32px ${FONT}`,
                                       fill: 'blue', alpha: 0, z: 60, maxWidth: 900 }),
    ]), r1, r2, mc, pc };
}

/** Scene 8: scan a code, get the contact. */
function boardQr(t) {
    const qr = qrParts('qr', { cx: 540, cy: 790, size: 300, seed: 1971 });
    const cardc = contactCardParts('cc', { name: t.cardName, phone: t.cardPhone,
                                           detail: t.cardWork, cy: 1156 });
    // The camera's framing brackets, which is what the scan screen shows.
    const b = 196, k = 54, g = 7;
    const corner = (dx, dy, id) => pathPart(id,
        `${M(540 + dx * b - dx * 0, 790 + dy * b - dy * k)} `
        + `${L(540 + dx * b, 790 + dy * b)} ${L(540 + dx * b - dx * k, 790 + dy * b)}`,
        { stroke: 'blue', strokeWidth: g, alpha: 0, z: 50, lineCap: 'round' });
    return { ...board('qr', [
        textPart('h', t.qrH, { at: [540, 460], font: `800 50px ${FONT}`, fill: 'ink',
                               alpha: 0, z: 60, maxWidth: 940 }),
        textPart('sub', t.qrSub, { at: [540, 524], font: `600 28px ${FONT}`, fill: 'dim',
                                   alpha: 0, z: 60, maxWidth: 900 }),
        ...qr.parts,
        corner(-1, -1, 'qc0'), corner(1, -1, 'qc1'),
        corner(1, 1, 'qc2'), corner(-1, 1, 'qc3'),
        ...cardc.parts,
    ]), qrIds: qr.ids, cornerIds: ['qc0', 'qc1', 'qc2', 'qc3'], cardIds: cardc.ids };
}

/** Scene 9: hidden by default. */
function boardHide(t) {
    const ph = phoneParts('r', { title: t.chatBack, mode: t.modeChip, hint: t.hintTxt });
    const s = ph.screen;
    const h1 = hiddenBubbleParts('x1', { screen: s, top: ph.top, w: 266, side: 'left',
                                         bars: [0.88, 0.5] });
    const h2 = hiddenBubbleParts('x2', { screen: s, top: h1.bottom + 28, w: 300 });
    const h3 = hiddenBubbleParts('x3', { screen: s, top: h2.bottom + 28, w: 240,
                                         side: 'left', bars: [0.7] });
    // The one that has been tapped: the same slot, readable.
    const open = bubbleParts('x4', t.sent1, { screen: s, top: h3.bottom + 28, w: 330 });
    const chip = chipParts('hdc', t.hideH,
        { at: [540, 1382], fill: '#0e2036', stroke: '#2d5681', textFill: 'blue' });
    const parts = [...ph.parts, ...h1.parts, ...h2.parts, ...h3.parts, ...open.parts,
                   ...chip.parts];
    for (const x of parts) if (ph.ids.includes(x.id)) x.alpha = 1;
    return { ...board('hide', parts), h1, h2, h3, open, chip };
}

/** Scene 10: the lock, and what it covers. */
function boardLock(t) {
    const chip = chipParts('lkc', t.lockChip,
        { at: [540, 880], fill: '#0e2036', stroke: '#2d5681', textFill: 'blue' });
    const lines = t.lockLines.map((text, i) => textPart(`lk${i}`, text, {
        at: [540, 1000 + i * 86], font: `700 44px ${FONT}`, fill: 'ink', alpha: 0, z: 60,
        maxWidth: 940 }));
    return { ...board('lock', [
        ...lockParts('pad', [540, 690], { w: 150, h: 126 }).map((x) => ({ ...x, alpha: 0 })),
        ...chip.parts, ...lines,
    ]), lineIds: lines.map((x) => x.id), chip, padIds: ['pad_sh', 'pad_bd', 'pad_kh'] };
}

/** Scene 11: the rest of what is in there. */
function boardMore(t) {
    const rows = cardRows('mr', t.more.map(([a, b]) => [a, b, XMS_PALETTE.blue]),
                          { top: 640, h: 176, gap: 22 });
    return { ...board('more', [
        textPart('h', t.moreH, { at: [540, 560], font: `800 42px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

/** Scene 12: how to start. */
function boardStart(t) {
    const rows = cardRows('sr', t.steps.map(([a, b]) => [a, b, XMS_PALETTE.blue]),
                          { top: 622, h: 176, gap: 22 });
    return { ...board('start', [
        textPart('h', t.startH, { at: [540, 546], font: `800 42px ${FONT}`, fill: 'ink',
                                  alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

// ---------------------------------------------------------------------------
// The film
// ---------------------------------------------------------------------------

export function ad(lang) {
    const t = T[lang];
    const p = P[lang];

    const hook = boardHook(t);
    const note = boardNote(t);
    const why = boardWhy(t);
    const brand = boardBrand(t);
    const send = boardSend(t);
    const plain = boardPlain(t);
    const modes = boardModes(t);
    const qr = boardQr(t);
    const hide = boardHide(t);
    const lock = boardLock(t);
    const more = boardMore(t);
    const start = boardStart(t);
    const card = endCard(lang);

    const boards = [hook, note, why, brand, send, plain, modes, qr, hide, lock, more,
                    start, board('card', card.parts), board('ban', bannerParts(lang))];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'xms' });

    /** The pinned banner, in every scene but the end card. */
    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];
    const crossOut = { kind: 'crossfade', duration: 0.4 };

    const scenes = [
        {
            id: 'hook', palette: 'xms',
            background: { color: XMS_PALETTE.bg },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.5 },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('hook', { alpha: 1 })]),
            shots: [
                // The hook carries no title for its first seconds: a card in
                // the opening window spends the window. docs/27-RETENTION.md.
                { id: 'k0', dialogue: [vo(p[0], 0.2)],
                  actions: [
                      ...build('hook', hook.b1.ids, 0.2, { gap: 0.08, span: 0.28 }),
                      ...build('hook', hook.b2.ids, 1.1, { gap: 0.08, span: 0.28 }),
                      ...reveal('hook', 'hfail', 2.0, { span: 0.3 }),
                      ...build('hook', ['kicker', 'title'], titleAt(p[0], lang),
                               { gap: 0.22, span: 0.45 }),
                  ] },
                { id: 'k1', dialogue: [vo(p[1], 0.2)],
                  actions: [
                      ...build('hook', hook.banIds, 0.3, { gap: 0.1, span: 0.3 }),
                      ...build('hook', hook.chip.ids, 1.0, { gap: 0.06, span: 0.35 }),
                  ] },
            ],
        },
        {
            id: 'why', palette: 'xms',
            background: { color: '#080f1a' },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('why', { alpha: 1 })]),
            shots: [
                { id: 'w0', dialogue: [vo(p[2], 0.2)],
                  actions: [
                      ...reveal('why', 'h', 0.2, { span: 0.4 }),
                      ...build('why', why.rows.rowIds(0), 1.0, { gap: 0.09, span: 0.35 }),
                  ] },
                { id: 'w1', dialogue: [vo(p[3], 0.2)],
                  actions: build('why', why.rows.rowIds(1), 0.25, { gap: 0.09, span: 0.35 }) },
                { id: 'w2', dialogue: [vo(p[4], 0.2)],
                  actions: build('why', why.rows.rowIds(2), 0.25, { gap: 0.09, span: 0.35 }) },
            ],
        },
        {
            id: 'her', palette: 'xms',
            background: { color: '#101826' },
            transitionOut: crossOut,
            cast: withBan([offstage('neema'), offstage('host'),
                           castBoard('note', { alpha: 1 })]),
            shots: [
                { id: 'n0', dialogue: [says('neema', p[5], 0.3)],
                  actions: [
                      ...build('note', ['nb', 'nt'], 0.2, { gap: 0.1, span: 0.35 }),
                      ...reveal('note', 'nf', 1.3, { span: 0.3 }),
                      ...build('note', ['nban_o', 'nban_s'], 2.0, { gap: 0.12, span: 0.35 }),
                  ] },
                { id: 'n1', dialogue: [vo(p[6], 0.25)], actions: [] },
            ],
        },
        {
            id: 'brand', palette: 'xms',
            background: { color: '#050b14' },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('brand', { alpha: 1 })]),
            shots: [
                { id: 'b0', dialogue: [vo(p[7], 0.2)],
                  actions: [
                      ...pop('brand', 'wm', 0.15, { span: 0.5, overshoot: 0.1 }),
                      ...reveal('brand', 'wmrule', 0.7, { span: 0.4 }),
                  ] },
                { id: 'b1', dialogue: [vo(p[8], 0.2)],
                  actions: build('brand', brand.lineIds, 0.25, { gap: 0.55, span: 0.35 }) },
            ],
        },
        {
            id: 'send', palette: 'xms',
            background: { color: XMS_PALETTE.bg },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), offstage('juma'),
                           castBoard('send', { alpha: 1 })]),
            shots: [
                { id: 'g0', dialogue: [vo(p[9], 0.2)],
                  actions: [
                      ...build('send', send.off.ids, 0.2, { gap: 0.06, span: 0.3 }),
                      ...build('send', send.b1.ids, 0.9, { gap: 0.08, span: 0.28 }),
                      ...build('send', send.b2.ids, 1.6, { gap: 0.08, span: 0.28 }),
                      // The data chip goes out and the delivery chip comes in
                      // on the same beat: that swap IS the claim of the scene.
                      ...conceal('send', 'soff_c', 2.7, { span: 0.3 }),
                      ...conceal('send', 'soff_x', 2.7, { span: 0.3 }),
                      ...build('send', send.ok.ids, 3.0, { gap: 0.06, span: 0.35 }),
                      ...reveal('send', 'sdel', 3.1, { span: 0.3 }),
                  ] },
                { id: 'g1', dialogue: [says('juma', p[10], 0.25)],
                  actions: build('send', send.b3.ids, 0.3, { gap: 0.1, span: 0.3 }) },
                { id: 'g2', dialogue: [vo(p[11], 0.2)],
                  actions: build('send', send.sig.ids, 0.3, { gap: 0.12, span: 0.3 }) },
            ],
        },
        {
            id: 'plain', palette: 'xms',
            background: { color: '#0a0f16' },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('plain', { alpha: 1 })]),
            shots: [
                { id: 'y0', dialogue: [vo(p[12], 0.2)],
                  actions: reveal('plain', 'ph_h', 0.2, { span: 0.4 }) },
                { id: 'y1', dialogue: [vo(p[13], 0.2)],
                  actions: [
                      ...build('plain', plain.g.ids, 0.3, { gap: 0.1, span: 0.3 }),
                      ...build('plain', plain.their.ids, 1.4, { gap: 0.06, span: 0.35 }),
                  ] },
                { id: 'y2', dialogue: [vo(p[14], 0.2)],
                  actions: [
                      ...reveal('plain', 'ph_ar', 0.3, { span: 0.3 }),
                      ...build('plain', plain.fixed.ids, 0.8, { gap: 0.1, span: 0.3 }),
                      ...conceal('plain', 'pth_c', 1.5, { span: 0.3 }),
                      ...conceal('plain', 'pth_x', 1.5, { span: 0.3 }),
                      ...build('plain', plain.fix.ids, 1.8, { gap: 0.06, span: 0.35 }),
                  ] },
            ],
        },
        {
            id: 'modes', palette: 'xms',
            background: { color: '#080f1a' },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('modes', { alpha: 1 })]),
            shots: [
                { id: 'm0', dialogue: [vo(p[15], 0.2)],
                  actions: [
                      ...reveal('modes', 'h', 0.2, { span: 0.4 }),
                      ...build('modes', modes.r1.ids, 0.9, { gap: 0.07, span: 0.3 }),
                      ...build('modes', modes.r2.ids, 1.9, { gap: 0.07, span: 0.3 }),
                  ] },
                { id: 'm1', dialogue: [vo(p[16], 0.2)],
                  actions: [
                      ...build('modes', modes.mc.ids, 0.3, { gap: 0.06, span: 0.32 }),
                      ...build('modes', modes.pc.ids, 0.9, { gap: 0.06, span: 0.32 }),
                      ...reveal('modes', 'foot', 1.8, { span: 0.45 }),
                  ] },
            ],
        },
        {
            id: 'qr', palette: 'xms',
            background: { color: '#060d16' },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('qr', { alpha: 1 })]),
            shots: [
                { id: 'q0', dialogue: [vo(p[17], 0.2)],
                  actions: [
                      ...reveal('qr', 'h', 0.2, { span: 0.4 }),
                      ...reveal('qr', 'sub', 0.6, { span: 0.35 }),
                      ...build('qr', qr.cornerIds, 1.0, { gap: 0.08, span: 0.28 }),
                      ...build('qr', qr.qrIds, 1.5, { gap: 0.05, span: 0.3 }),
                  ] },
                { id: 'q1', dialogue: [vo(p[18], 0.2)],
                  actions: build('qr', qr.cardIds, 0.4, { gap: 0.09, span: 0.32 }) },
            ],
        },
        {
            id: 'hide', palette: 'xms',
            background: { color: XMS_PALETTE.bg },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('hide', { alpha: 1 })]),
            shots: [
                { id: 'h0', dialogue: [vo(p[19], 0.2)],
                  actions: [
                      ...build('hide', hide.h1.ids, 0.2, { gap: 0.07, span: 0.3 }),
                      ...build('hide', hide.h2.ids, 0.7, { gap: 0.07, span: 0.3 }),
                      ...build('hide', hide.h3.ids, 1.2, { gap: 0.07, span: 0.3 }),
                      ...build('hide', hide.open.ids, 2.0, { gap: 0.1, span: 0.3 }),
                      ...build('hide', hide.chip.ids, 2.7, { gap: 0.06, span: 0.35 }),
                  ] },
            ],
        },
        {
            id: 'lock', palette: 'xms',
            background: { color: '#05101c' },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('lock', { alpha: 1 })]),
            shots: [
                { id: 'l0', dialogue: [vo(p[20], 0.2)],
                  actions: [
                      ...build('lock', lock.padIds, 0.2, { gap: 0.1, span: 0.4 }),
                      ...build('lock', lock.chip.ids, 0.9, { gap: 0.06, span: 0.35 }),
                      ...build('lock', lock.lineIds, 1.9, { gap: 0.55, span: 0.35 }),
                  ] },
            ],
        },
        {
            id: 'more', palette: 'xms',
            background: { color: '#070e18' },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('more', { alpha: 1 })]),
            shots: [
                { id: 'f0', dialogue: [vo(p[21], 0.2)],
                  actions: [
                      ...reveal('more', 'h', 0.2, { span: 0.4 }),
                      ...build('more', more.rows.rowIds(0), 0.9, { gap: 0.08, span: 0.32 }),
                  ] },
                { id: 'f1', dialogue: [vo(p[22], 0.2)],
                  actions: [
                      ...build('more', more.rows.rowIds(1), 0.25, { gap: 0.08, span: 0.3 }),
                      ...build('more', more.rows.rowIds(2), 1.5, { gap: 0.08, span: 0.3 }),
                  ] },
            ],
        },
        {
            id: 'start', palette: 'xms',
            background: { color: '#080f1a' },
            transitionOut: crossOut,
            cast: withBan([offstage('host'), castBoard('start', { alpha: 1 })]),
            shots: [
                { id: 'r0', dialogue: [vo(p[23], 0.2)],
                  actions: reveal('start', 'h', 0.2, { span: 0.4 }) },
                { id: 'r1', dialogue: [vo(p[24], 0.2)],
                  actions: [
                      ...build('start', start.rows.rowIds(0), 0.25, { gap: 0.08, span: 0.32 }),
                      ...build('start', start.rows.rowIds(1), 1.6, { gap: 0.08, span: 0.32 }),
                      ...build('start', start.rows.rowIds(2), 2.9, { gap: 0.08, span: 0.32 }),
                  ] },
            ],
        },
        {
            id: 'card', palette: 'xms',
            background: { color: '#03070d' },
            transitionIn: { kind: 'crossfade', duration: 0.45 },
            cast: [offstage('host'), castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'e0', dialogue: [vo(p[25], 0.25)],
                  actions: build('card', card.ids, 0.2, { gap: 0.16, span: 0.38 }) },
            ],
        },
    ];

    return fitShots({
        version: 'jirex.film/1',
        meta: { ...META(lang), estimatedTiming: true },
        palettes: { xms: XMS_PALETTE },
        voices: voicesFor(lang),
        characters,
        scenes,
    }, lang);
}
