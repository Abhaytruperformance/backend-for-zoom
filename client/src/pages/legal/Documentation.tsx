import { LegalLayout } from "./LegalLayout.js";

export default function Documentation() {
  return (
    <LegalLayout title="Documentation">
      <p>How this app turns a recorded Zoom meeting into decisions, action items, and an approved follow-up email.</p>

      <h2>1. Connect Zoom</h2>
      <p>
        From the Zoom page in the app, connect your Zoom account. Once connected, any meeting you host that gets recorded to Zoom's
        cloud is automatically picked up after the recording and transcript finish processing.
      </p>

      <h2>2. Meetings are processed automatically</h2>
      <p>
        Once a transcript is ready, the app extracts a summary, decisions, action items, risks, and open questions using AI, and matches
        the meeting to the right client account by participant email domain. If it can't confidently match one account, it's flagged for
        manual resolution on the Accounts page.
      </p>

      <h2>3. Decisions and action items build a relationship history</h2>
      <p>
        As you have more meetings with the same account, later decisions correctly supersede earlier ones instead of creating
        duplicates — if a client changes their mind in a follow-up call, the app updates the record rather than leaving two conflicting
        entries. The same applies to action items: a reassigned owner or a changed due date updates the existing commitment.
      </p>

      <h2>4. Review and approve the follow-up draft</h2>
      <p>
        Every processed meeting gets an AI-drafted follow-up email, but nothing is ever sent automatically. Open the meeting's Approval
        screen to edit the subject, body, and recipients, then approve it — only then does it send, via your connected Gmail or
        Microsoft mailbox.
      </p>

      <h2>5. Connect a mailbox to send</h2>
      <p>Connect Gmail or Microsoft from the Mailbox page — this is what actually sends an approved follow-up on your behalf.</p>

      <h2>Questions</h2>
      <p>
        See <a href="/support">Support</a> for common issues, or reach us directly at{" "}
        <a href="mailto:abhayshukla4455@gmail.com">abhayshukla4455@gmail.com</a>.
      </p>
    </LegalLayout>
  );
}
