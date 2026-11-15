/**
 * Why a relief grid cannot be shown, in plain words first. The server's own reason and what it needs (dataset,
 * setting, owner) follow as one technical line, so a setting name such as the MOLA mosaic's environment variable
 * never stands in the main sentence.
 */
export interface UnavailableWords {
  title: string;
  /** One plain sentence. */
  plain: string;
  /** Status · server reason · needs … · owner (empty when the server said nothing more). */
  technical: string;
}

/** Shape of the API client's error (`ApiError`): HTTP status (0 = unreachable), message and the response detail. */
export interface ReliefError {
  status?: number;
  message?: string;
  detail?: unknown;
}

export function unavailableWords(planet: "earth" | "mars", error: ReliefError | null | undefined): UnavailableWords {
  const status = typeof error?.status === "number" ? error.status : null;
  const d = error?.detail;
  const detail = d && typeof d === "object" ? (d as { reason?: unknown; missing_inputs?: unknown; owner?: unknown }) : null;
  const reason = typeof detail?.reason === "string" ? detail.reason : typeof d === "string" ? d : status === 0 ? error?.message ?? null : null;
  const needs = Array.isArray(detail?.missing_inputs) ? detail.missing_inputs.filter((x): x is string => typeof x === "string") : [];
  const owner = typeof detail?.owner === "string" ? detail.owner : null;
  const technical = [status ? String(status) : null, reason, needs.length ? `needs ${needs.join(", ")}` : null, owner].filter(Boolean).join(" · ");
  if (planet === "mars") {
    const notConnected = status === 503 && (!reason || /not connected/i.test(reason));
    return {
      title: "No Mars elevation grid",
      plain: notConnected ? "No Mars elevation grid is connected to this server (MOLA mosaic)."
        : status === 503 ? "This server cannot serve a Mars elevation grid yet."
          : "The Mars elevation grid could not be loaded.",
      technical,
    };
  }
  return {
    title: "Relief unavailable",
    plain: status === 404 ? "This window has no relief grid on this server." : "The elevation grid of this window could not be loaded.",
    technical,
  };
}
