import type { ApprovedFactSet } from './facts';

/**
 * Approved fact sets available to the reviewer surface.
 *
 * In production these come from the Growth Engine alongside the PageSpec. The
 * renderer has no Growth Engine connection in this phase, so every set here
 * declares an `authority` short of `growth-engine` and says plainly where its
 * statements came from. Nothing on this page is a claim about real customer
 * outcomes, and no page built from a `reviewer-fixture` set should be treated
 * as real marketing.
 */

/**
 * Transcribed from the contract's own med-spa example.
 *
 * The example cites thirteen distinct fact references across its mechanism,
 * fit and objection sections. The texts below are not a reading of the
 * document's prose: each one is the approved capability statement whose
 * FactReference digest is exactly the ref the document cites, so the binding
 * is derived and checkable rather than inferred from ordering. It is here so
 * the pipeline can be exercised against a genuinely authoritative document.
 *
 * The refs are the Growth Engine's, computed over its own namespace, so they
 * are NOT the digest of the text alone and this set is deliberately outside
 * DERIVED_FACT_SETS. Re-vendoring the contract example changes every one of
 * them, and this block has to be re-derived from the new example at the same
 * time — the digests are what make that a mechanical job rather than a guess.
 */
export const MED_SPA_CONTRACT_FACTS: ApprovedFactSet = {
  id: 'med-spa-contract',
  subject: 'The iThinq AI Voice Assistant, as stated by the contract med-spa example',
  authority: 'document-transcription',
  facts: [
    {
      ref: 'f_c010a61ad3143f508d2f2623674240d86192122746e7fa0f811d821ac2682b19',
      kind: 'capability',
      text: 'iThinq AI works as a virtual receptionist that answers calls, handles the conversation, books the appointment and follows up',
    },
    {
      ref: 'f_77be89b60f049e0f0beb5a91c9b1148646b46a21d45852364fc3cfc823bf246f',
      kind: 'capability',
      text: 'iThinq AI answers inbound calls 24 hours a day, every day, including the ones that arrive while the team is already on the phone',
    },
    {
      ref: 'f_aa47e811ca0d8153551053c5e751877e6bde1396414bd2bb65c54a2f2c38c5b5',
      kind: 'capability',
      text: 'iThinq AI holds a natural spoken conversation, listens, asks and responds the way a trained receptionist does',
    },
    {
      ref: 'f_a385166edc4b2a1d667c1239427c4f76df69025b4f230455edbff588604bf88f',
      kind: 'capability',
      text: 'iThinq AI checks availability and books the appointment during the call',
    },
    {
      ref: 'f_715ac41382dfc313ec81e6514a41e509fc5182cb6d4f8fd44e0825b71dfd077c',
      kind: 'capability',
      text: 'iThinq AI confirms appointments and sends the reminders and preparation details that go with them',
    },
    {
      ref: 'f_8eae91038e7f367c365828239f0e83bde8721a8fae181a00d238029334366524',
      kind: 'capability',
      text: 'iThinq AI asks the qualifying questions the team would ask and sorts the caller before anybody picks up',
    },
    {
      ref: 'f_f5192092f340ac32b85512a44ea72fd33fee26c410dcb0dbd086a8fa34f704ab',
      kind: 'capability',
      text: 'iThinq AI responds to online form enquiries by calling the person back',
    },
    {
      ref: 'f_ebb613758c5829f2d9b49c85947461a04650ab47959a06acaefa84da1bdc7a2e',
      kind: 'capability',
      text: 'iThinq AI keeps following up with a lead across repeated attempts rather than stopping after one',
    },
    {
      ref: 'f_8425e7281c55d84977e8c57263f7f58f9d54d0490269aa6bbaac19bf5a2ee4ba',
      kind: 'capability',
      text: 'iThinq AI can be configured to a persona of your choosing, from warm and consultative to brisk and professional',
    },
    {
      ref: 'f_d50aef2e03a6f2f55ebdb6ebe69b79d5f602891de2cdbd4ca3c1de4b7434eabd',
      kind: 'capability',
      text: 'iThinq AI holds conversations in multiple languages, including English and Spanish',
    },
    {
      ref: 'f_0af88cf19709c71e5d0238ce9cf2de66087bc5c4c94b6189f0811adfa3e06d42',
      kind: 'capability',
      text: 'iThinq AI remembers what was said in earlier conversations and carries it forward',
    },
    {
      ref: 'f_1e2d15ed6a8e3ca4a1e2921eb28b53849cb212665683cddde93cde9847068e10',
      kind: 'capability',
      text: 'iThinq AI integrates with your CRM so conversations arrive as records rather than as notes to type up',
    },
    {
      ref: 'f_a9576009ebf09bef874fb7743bb06db9d266f48eb397f1456e22d7386405496c',
      kind: 'capability',
      text: 'iThinq AI supports financing workflows, including walking a customer through the process and capturing what is needed',
    },
  ],
};

/**
 * The fact set behind the prose-less med-spa brief.
 *
 * A REVIEWER FIXTURE. It is what a Partner would have if they had approved
 * facts and no page: enough to author a campaign from, and nothing that has
 * already been written into marketing copy. Every ref is the SHA-256 of its
 * own text, so a fixture's references cannot drift from its statements — a
 * test asserts it.
 */
export const MED_SPA_BRIEF_FACTS: ApprovedFactSet = {
  id: 'med-spa-brief',
  subject: 'The iThinq AI Voice Assistant, offered to med spas',
  authority: 'reviewer-fixture',
  facts: [
    {
      ref: 'f_784924827248384e7f5977a873ec58e5aa236c78d04e50b2919d9546f3350f3c',
      kind: 'product',
      text: 'The iThinq AI Voice Assistant is an AI voice assistant that handles inbound phone calls for a business.',
    },
    {
      ref: 'f_0963f74f89a4ed5b99f40be35c4fea39bad6375845545c461b34c5860e0ec4ea',
      kind: 'audience',
      text: 'It is built for service businesses that take enquiries and bookings over the phone.',
    },
    {
      ref: 'f_143878727b81065765707852156f7eba2fdba402533e8b2c608bad293e010590',
      kind: 'audience',
      text: 'Med spas and aesthetics clinics are a target market.',
    },
    {
      ref: 'f_620369ef6dbc7cb8d54a7b5cddafc1a87e038f8ed89f9a179c15d67a06a1e579',
      kind: 'audience',
      text: 'Typical callers are prospective patients enquiring about a consultation.',
    },
    {
      ref: 'f_65208cb70807c023be72fb14759c35fcc709cfd7f530fa1c2da43bdb413b7d6b',
      kind: 'capability',
      text: 'Answers inbound calls.',
    },
    {
      ref: 'f_3a2e093c74946166ad21c428262935a2a70a1fe59c10302f2e499aec57ac532d',
      kind: 'capability',
      text: 'Takes the caller through the questions the team would ask about a consultation enquiry.',
    },
    {
      ref: 'f_5c9f0e28a9a042d6581ac52430326f8d0e2862ab10a83611bf6f4dcb44ad3f98',
      kind: 'capability',
      text: 'Captures the enquiry and hands it back in a form the practice can act on.',
    },
    {
      ref: 'f_2fb4fe1335c4b7fe5fcc3e71ff4982d5ebdd8b8e0986e992253feb43c8e6a9ff',
      kind: 'capability',
      text: 'Asks the same questions in the same order whoever is on shift.',
    },
    {
      ref: 'f_8ce1d5641d6c89c5950f3679e50e07a79f8ae7c7f127a6b918cc7eacc9f35e18',
      kind: 'capability',
      text: 'Keeps follow-up moving after the call has ended.',
    },
    {
      ref: 'f_6a1fb4df7d3db619e410036de81ec1691dab565b1b3a1c4343116d0888194529',
      kind: 'boundary',
      text: 'Answers calls outside opening hours where the setup supports it, which depends on how it is configured.',
    },
    {
      ref: 'f_ba49ad6d4788d69d60565968e25db87e57e607d89ec568c85a93096ad2b7eb12',
      kind: 'boundary',
      text: 'Does not replace the people who take the conversations that need a person.',
    },
    {
      ref: 'f_b18e09b6361cea88a35f7f4b15ee67ef0a287325f17c2ae58f52218302691059',
      kind: 'boundary',
      text: 'Helps with the enquiries around care rather than giving clinical advice.',
    },
    {
      ref: 'f_5dc0b43072f0b5f1f25a4185c7e64f72bf04b8ab629fba63bab4bc7f06d34bf9',
      kind: 'process',
      text: 'The product is shown on a demo call before a practice commits to it.',
    },
  ],
};

/**
 * The HVAC contrast set. A REVIEWER FIXTURE, refs derived from text.
 *
 * Deliberately not the med-spa list reworded: the trade's own intake shape and
 * its own boundary — emergency dispatch — are what make the contrast real
 * rather than a change of noun.
 */
export const HVAC_FACTS: ApprovedFactSet = {
  id: 'hvac',
  subject: 'The iThinq AI Voice Assistant, offered to HVAC and home-services companies',
  authority: 'reviewer-fixture',
  facts: [
    {
      ref: 'f_f9e49f59d6d44c32efa016112cd90781307c78e780a45b250cfcb6114b90419e',
      kind: 'capability',
      text: 'Answers inbound calls when the line would otherwise ring out.',
    },
    {
      ref: 'f_7d57a21b02d28d22947aa78299e444430ef45f8f8eaa054d989d3eee954ed3b2',
      kind: 'capability',
      text: 'Takes the caller through the questions a quote needs.',
    },
    {
      ref: 'f_c418c44a06d152c76b0e11fee2323934b4a8b9b0a0c48307f5d4af126367bd70',
      kind: 'capability',
      text: 'Hands the job details back in a form the office can act on.',
    },
    {
      ref: 'f_9ae491a7cb5daecf926ee2e109ba4e8764d98e3568d9538eb36567b77680980b',
      kind: 'capability',
      text: 'Asks the same questions in the same order on every call.',
    },
    {
      ref: 'f_b855a04e45223624fbeeb0172ffeabd67727e9d8a032fa95acfbdc68b76b54bf',
      kind: 'capability',
      text: 'Keeps the callback moving after the call ends.',
    },
    {
      ref: 'f_7333a6a92b2eeee445fec9f90ddd75f32c45c6595af700ea26d749c5d617c545',
      kind: 'boundary',
      text: 'Answers calls outside office hours where the setup supports it, which depends on how it is configured.',
    },
    {
      ref: 'f_f8130ae8a24beda0806260346bc2359df08bb53519f78c40bfb426ce938b8944',
      kind: 'boundary',
      text: 'Does not make emergency dispatch decisions.',
    },
    {
      ref: 'f_9bead8ef00effdaed8d6f24b9225d9683cf8c5df7507ce34a033605e623e547a',
      kind: 'boundary',
      text: 'Does not replace the people who handle the calls that need a person.',
    },
    {
      ref: 'f_d02a56c03b60858647a90be917afe59c6c04b385a23b1438c1dc494f86687fce',
      kind: 'audience',
      text: 'Built for service businesses that take work over the phone.',
    },
    {
      ref: 'f_b2b6423b56222fe55e697cc435a92e8d1c2d377e451d2aa46e351ba8d848fe5e',
      kind: 'audience',
      text: 'Small HVAC and home-services companies are a target market.',
    },
    {
      ref: 'f_885b91cf3bd55e73d4f9a0fba8de76e569a14dc2cc1f088684d23436520eaef6',
      kind: 'product',
      text: 'The iThinq AI Voice Assistant is an AI voice assistant for inbound calls.',
    },
  ],
};

/** Sets whose refs are content-addressed, and which a test holds to that. */
export const DERIVED_FACT_SETS: readonly ApprovedFactSet[] = [MED_SPA_BRIEF_FACTS, HVAC_FACTS];
