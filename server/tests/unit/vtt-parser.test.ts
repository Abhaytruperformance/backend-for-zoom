import { describe, expect, it } from "vitest";
import { parseVtt } from "../../src/modules/zoom/ingestion.js";

const SAMPLE_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:03.000
Alice: Let's kick off the meeting.

2
00:00:03.500 --> 00:00:07.000
Bob: Sounds good, I'll send the proposal by Friday.
`;

describe("parseVtt", () => {
  it("extracts speaker, timestamps, and text from a standard Zoom VTT export", () => {
    const segments = parseVtt(SAMPLE_VTT);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ speaker: "Alice", start: "00:00:00.000", text: "Let's kick off the meeting." });
    expect(segments[1]).toMatchObject({ speaker: "Bob", text: "Sounds good, I'll send the proposal by Friday." });
  });

  it("falls back to 'Unknown' speaker when a line has no 'Name:' prefix", () => {
    const noSpeaker = `WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\njust some text with no colon prefix\n`;
    const segments = parseVtt(noSpeaker);
    expect(segments[0].speaker).toBe("Unknown");
  });

  it("handles an empty transcript body without throwing", () => {
    expect(parseVtt("WEBVTT\n")).toEqual([]);
  });
});
