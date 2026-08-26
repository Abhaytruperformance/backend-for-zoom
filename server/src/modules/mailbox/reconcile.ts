/**
 * Result of asking a provider "did this message already go out?".
 *
 * Three states, not two. The old boolean collapsed "the provider said no" and "we could not
 * get an answer" into the same `false`, and the caller treated that as permission to send
 * again — which is precisely the case where a duplicate email reaches a client. An
 * unreachable or erroring provider must block the re-send and surface for a human instead.
 */
export type ReconcileResult =
  | { status: "found"; providerMessageId?: string }
  | { status: "not_found" }
  | { status: "unknown"; reason: string };
