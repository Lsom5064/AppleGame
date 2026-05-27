const STUN_SERVER_URLS = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];
const NETWORK_FINGERPRINT_TIMEOUT_MS = 2500;

interface ParsedIceCandidate {
  address: string;
  type: string;
}

let fingerprintPromise: Promise<string | null> | null = null;

export function parseIceCandidate(candidate: string): ParsedIceCandidate | null {
  const match = candidate.match(/candidate:\S+ \d+ \S+ \d+ ([^ ]+) \d+ typ (\w+)/);

  if (!match) {
    return null;
  }

  const [, address, type] = match;
  return { address, type };
}

async function hashAddress(address: string): Promise<string> {
  const encoded = new TextEncoder().encode(address);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

async function resolveNetworkFingerprint(): Promise<string | null> {
  if (typeof window === "undefined" || typeof RTCPeerConnection === "undefined") {
    return null;
  }

  return new Promise((resolve) => {
    const connection = new RTCPeerConnection({
      iceServers: [
        {
          urls: STUN_SERVER_URLS
        }
      ]
    });
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      connection.onicecandidate = null;
      connection.onicegatheringstatechange = null;
      connection.close();
      resolve(value);
    };

    const timeoutId = window.setTimeout(() => finish(null), NETWORK_FINGERPRINT_TIMEOUT_MS);

    connection.createDataChannel("apple-sum-nearby");
    connection.onicecandidate = (event) => {
      const candidateText = event.candidate?.candidate;

      if (!candidateText) {
        return;
      }

      const parsed = parseIceCandidate(candidateText);
      if (!parsed || parsed.type !== "srflx") {
        return;
      }

      void hashAddress(parsed.address)
        .then((fingerprint) => finish(fingerprint))
        .catch(() => finish(null));
    };

    connection.onicegatheringstatechange = () => {
      if (connection.iceGatheringState === "complete") {
        finish(null);
      }
    };

    void connection
      .createOffer()
      .then((offer) => connection.setLocalDescription(offer))
      .catch(() => finish(null));
  });
}

export function getNetworkFingerprint(): Promise<string | null> {
  fingerprintPromise ??= resolveNetworkFingerprint();
  return fingerprintPromise;
}
