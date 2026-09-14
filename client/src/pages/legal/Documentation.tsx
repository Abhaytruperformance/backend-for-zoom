import { LegalLayout } from "./LegalLayout.js";

export default function Documentation() {
  return (
    <LegalLayout title="Documentation">
      <p>How to add, use, and remove the meeting assitant app for your Zoom account.</p>

      <h2>Adding the app</h2>
      <p>
        Install "meeting assitant" from the Zoom App Marketplace and authorize it with your Zoom account. You'll be redirected to
        create (or log into) your meeting assitant workspace, then back to Zoom once authorization completes. No separate download is
        required — everything runs from your browser at{" "}
        <a href="https://meeting.tp-devserver.com">meeting.tp-devserver.com</a>.
      </p>
      <p>
        After authorizing, connect a Gmail or Microsoft mailbox from the app's Mailbox page — this is what the app uses to send an
        approved follow-up email on your behalf. Connecting a mailbox is separate from the Zoom authorization and optional until you
        want to send your first follow-up.
      </p>

      <h2>Using the app</h2>
      <p>Once connected, any meeting you host that Zoom records to the cloud is picked up automatically:</p>
      <ul>
        <li>The transcript is pulled once Zoom's Cloud Recording finishes processing it.</li>
        <li>AI extracts a summary, decisions, action items, risks, and open questions, and matches the meeting to the right client account by participant email domain.</li>
        <li>As you have more meetings with the same account, later decisions and action items correctly update or supersede earlier ones instead of creating duplicates.</li>
        <li>An AI-drafted follow-up email is prepared for every processed meeting — but nothing is ever sent automatically. Open the meeting's Approval screen to edit the subject, body, and recipients, then approve it; only then does it send.</li>
      </ul>

      <h2>Removing the app</h2>
      <p>
        You can disconnect at either level, independently:
      </p>
      <ul>
        <li><strong>From inside the app</strong> — use the Disconnect button on the Zoom or Mailbox page to immediately revoke and delete that stored connection.</li>
        <li><strong>From Zoom directly</strong> — in the Zoom App Marketplace, go to Manage → Installed Apps, find "meeting assitant," and remove it. This revokes the app's access from Zoom's side; any data already processed remains in your workspace until you separately request deletion (see our <a href="/privacy">Privacy Policy</a> for how).</li>
      </ul>

      <h2>Questions</h2>
      <p>
        See <a href="/support">Support</a> for common issues, or reach us directly at{" "}
        <a href="mailto:abhayshukla4455@gmail.com">abhayshukla4455@gmail.com</a>.
      </p>
    </LegalLayout>
  );
}
