/**
 * Fixture pages for deterministic tests.
 *
 * Hand-written to exercise the parser and extractor — nav chrome, scripts,
 * styles, entities, a list, a heading-based FAQ and JSON-LD. They are NOT a
 * copy of the real iThinq site and are not a source of product truth; a test
 * that depended on the live site staying still would fail for reasons that
 * have nothing to do with this code.
 */
export const VOICE_ASSISTANT_HTML = `<!doctype html>
<html><head>
<title>AI Voice Assistant &mdash; iThinq</title>
<meta name="description" content="An AI voice assistant that answers inbound calls for service businesses when the team is unavailable.">
<style>.hero{color:red}</style>
<script>window.dataLayer = [{secret: 'do-not-read-me'}];</script>
<script type="application/ld+json">
{"@type":"FAQPage","mainEntity":[
  {"@type":"Question","name":"Does it replace my receptionist?",
   "acceptedAnswer":{"@type":"Answer","text":"No. It answers the calls nobody is free to take, and hands anything that needs a person straight to your team."}}
]}
</script>
</head>
<body>
<nav><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/contact">Contact</a></nav>
<header><p>Get started</p></header>
<main>
  <h1>AI Voice Assistants</h1>
  <p>The iThinq AI Voice Assistant answers incoming calls, captures customer information, and keeps conversations moving when your team is unavailable.</p>
  <h2>What it does on a call</h2>
  <ul>
    <li>Answers inbound calls around the clock, including after your office has closed.</li>
    <li>Captures the caller&rsquo;s details and what they are asking about.</li>
    <li>Books appointments directly into the calendar your team already uses.</li>
    <li>Menu</li>
  </ul>
  <h2>Built for service businesses</h2>
  <p>It is designed for appointment-based service businesses such as med spas, dental practices and home service contractors.</p>
  <h3>Will it sound robotic?</h3>
  <p>Callers have an ordinary conversation. You can listen to a recording of a real call on a demo before you commit.</p>
  <h3>Does it work outside business hours?</h3>
  <p>It answers outside opening hours where your setup supports it, which depends on how your account is configured.</p>
  <p>Short.</p>
</main>
<footer><p>&copy; 2026 iThinq. All rights reserved.</p><p>Privacy policy</p></footer>
</body></html>`;

export const PRICING_HTML = `<!doctype html>
<html><head><title>Pricing &mdash; iThinq</title></head>
<body><nav><a href="/">Home</a></nav><main>
<h1>Pricing</h1>
<p>Plans start at $149 per month for a single location, billed monthly with no long-term contract.</p>
<p>Every plan includes onboarding support and a guided setup call with our team.</p>
</main></body></html>`;

export const INDUSTRIES_HTML = `<!doctype html>
<html><head><title>Industries &mdash; iThinq</title></head>
<body><main>
<h1>Industries we serve</h1>
<p>Med spas and aesthetic clinics use iThinq to answer consultation enquiries while practitioners are with clients.</p>
<p>HVAC and home service contractors use iThinq to take job details when every technician is out on site.</p>
</main></body></html>`;

/** The same page after an edit, for testing refresh identity behaviour. */
export const PRICING_HTML_UPDATED = PRICING_HTML.replace('$149 per month', '$199 per month');
