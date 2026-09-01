> **Draft — needs legal review before publication.** This reflects what the application actually does with data, written by the engineering team for a Zoom Marketplace submission. It is not a substitute for review by qualified legal counsel before being published as a binding policy or linked from the live app.

# Privacy Policy — Zoom Meeting Intelligence & Relationship Knowledge Base

**Last updated:** 2026-09-01

## What this app does

This application connects to a company's Zoom account (and optionally Google/Microsoft mailboxes) to turn meeting recordings into structured, searchable relationship intelligence: meeting summaries, decisions, action items, and AI-drafted follow-up emails for human review and approval before anything is sent.

## Data we collect

- **Zoom account data**, via the Zoom OAuth scopes the connecting user grants: basic profile info, meeting metadata (title, time, participants), cloud recording transcripts.
- **Meeting transcripts** — the text content of recorded meetings, downloaded from Zoom's Cloud Recording API.
- **Participant information** — names and email addresses of meeting participants, as provided by Zoom.
- **Mailbox data** (only if a user separately connects Gmail or Microsoft), via OAuth scopes limited to sending mail and basic profile — not general inbox read access.
- **Account credentials** — for this app's own login, an email address and a bcrypt-hashed password (the plaintext password is never stored).

## How we use it

- Transcripts are sent to OpenAI's API (GPT-4o-mini) to extract a structured summary, decisions, action items, risks, and open questions. This is the only third party that processes transcript *content*.
- Extracted data is used to build an internal relationship knowledge base per client account (decisions made, commitments open, relationship history) and to draft follow-up emails, which a human always reviews and explicitly approves before anything is sent to a client.
- We do not use this data to train any model, ours or a third party's, beyond the single per-request inference call described above.

## Who we share it with

- **OpenAI** — receives transcript content and derived context for extraction, per OpenAI's own API data-use terms (not used for model training under standard API terms).
- **Zoom, Google, Microsoft** — receive only the API requests necessary to fetch the data described above; we don't share our users' data back to them beyond normal API usage.
- We do not sell data, and we do not share it with any other third party.

## Data retention

- Transcripts, extracted decisions/action items, and relationship summaries are retained for as long as the connected Zoom/mailbox account remains active, so the knowledge base stays useful across the life of a client relationship.
- OAuth tokens are deleted immediately on disconnect (the in-app "Disconnect" action removes the stored, encrypted token record).
- A tenant/account can request full data deletion by contacting us (see Contact, below); we will delete all associated meetings, transcripts, extractions, and contact records.

## Security measures

- OAuth access/refresh tokens are encrypted at rest (AES-256-GCM) before storage, never stored in plaintext.
- All data in transit is encrypted via TLS 1.2 or higher.
- Access to the production database and infrastructure is restricted to the engineering team.
- See `compliance/SECURITY-POLICY.md` for the fuller security program this policy sits under.

## Your rights

If you're a participant in a meeting processed by this app (not necessarily the account holder), you can request to know what data we hold about you, request its correction, or request its deletion, by contacting us using the details below.

## Contact

**[Fill in: legal/DPO contact email and company registered address before publishing.]**
