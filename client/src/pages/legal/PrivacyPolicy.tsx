import { LegalLayout } from "./LegalLayout.js";

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" updated="September 14, 2026">
      <h2>What this app does</h2>
      <p>
        This application connects to a company's Zoom account (and optionally Google/Microsoft mailboxes) to turn meeting recordings into
        structured, searchable relationship intelligence: meeting summaries, decisions, action items, and AI-drafted follow-up emails for
        human review and approval before anything is sent.
      </p>

      <h2>Data we collect</h2>
      <ul>
        <li><strong>Zoom account data</strong>, via the Zoom OAuth scopes the connecting user grants: basic profile info, meeting metadata (title, time, participants), cloud recording transcripts.</li>
        <li><strong>Meeting transcripts</strong> — the text content of recorded meetings, downloaded from Zoom's Cloud Recording API.</li>
        <li><strong>Participant information</strong> — names and email addresses of meeting participants, as provided by Zoom.</li>
        <li><strong>Mailbox data</strong> (only if a user separately connects Gmail or Microsoft), via OAuth scopes limited to sending mail and basic profile — not general inbox read access.</li>
        <li><strong>Account credentials</strong> — for this app's own login, an email address and a bcrypt-hashed password (the plaintext password is never stored).</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Transcripts are sent to OpenAI's API (GPT-4o-mini) to extract a structured summary, decisions, action items, risks, and open
        questions. This is the only third party that processes transcript content. Extracted data is used to build an internal
        relationship knowledge base per client account and to draft follow-up emails, which a human always reviews and explicitly
        approves before anything is sent to a client. We do not use this data to train any model, ours or a third party's, beyond the
        single per-request inference call described above.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>OpenAI</strong> — receives transcript content and derived context for extraction, per OpenAI's own API data-use terms (not used for model training under standard API terms).</li>
        <li><strong>Zoom, Google, Microsoft</strong> — receive only the API requests necessary to fetch the data described above; we don't share your data back to them beyond normal API usage.</li>
        <li>We do not sell data, and we do not share it with any other third party.</li>
      </ul>

      <h2>Data retention</h2>
      <ul>
        <li>Transcripts, extracted decisions/action items, and relationship summaries are retained for as long as the connected Zoom/mailbox account remains active.</li>
        <li>OAuth tokens are deleted immediately on disconnect.</li>
        <li>A tenant or account can request full data deletion by contacting us (see below); we will delete all associated meetings, transcripts, extractions, and contact records.</li>
      </ul>

      <h2>Security measures</h2>
      <ul>
        <li>OAuth access/refresh tokens are encrypted at rest (AES-256-GCM) before storage, never stored in plaintext.</li>
        <li>All data in transit is encrypted via TLS 1.2 or higher.</li>
        <li>Access to the production database and infrastructure is restricted to the engineering team.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        If you're a participant in a meeting processed by this app (not necessarily the account holder), you can request to know what
        data we hold about you, request its correction, or request its deletion, by contacting us below.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:abhayshukla4455@gmail.com">abhayshukla4455@gmail.com</a>
      </p>
    </LegalLayout>
  );
}
