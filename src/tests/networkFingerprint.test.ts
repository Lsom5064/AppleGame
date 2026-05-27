import { describe, expect, it } from "vitest";
import { parseIceCandidate } from "../utils/networkFingerprint";

describe("networkFingerprint", () => {
  it("parses a server reflexive ICE candidate", () => {
    expect(
      parseIceCandidate(
        "candidate:842163049 1 udp 1677729535 203.0.113.42 55996 typ srflx raddr 192.168.0.10 rport 55996 generation 0 ufrag abc network-cost 999"
      )
    ).toEqual({
      address: "203.0.113.42",
      type: "srflx"
    });
  });

  it("parses a host ICE candidate", () => {
    expect(
      parseIceCandidate(
        "candidate:123456789 1 udp 2122260223 192.168.0.50 60769 typ host generation 0 ufrag xyz network-cost 999"
      )
    ).toEqual({
      address: "192.168.0.50",
      type: "host"
    });
  });

  it("returns null when the candidate string is malformed", () => {
    expect(parseIceCandidate("not-a-candidate")).toBeNull();
  });
});
