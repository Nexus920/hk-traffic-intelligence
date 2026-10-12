import assert from "node:assert/strict"
import { buildCtbEtaApiUrl, buildCtbRouteStopApiUrl } from "./ctb-api-paths.ts"

const base = "https://rt.data.gov.hk/v2/transport/citybus"

assert.equal(
  buildCtbRouteStopApiUrl(base, "20A", "inbound"),
  "https://rt.data.gov.hk/v2/transport/citybus/route-stop/ctb/20A/inbound",
)
assert.equal(
  buildCtbRouteStopApiUrl(base, "22", "outbound"),
  "https://rt.data.gov.hk/v2/transport/citybus/route-stop/ctb/22/outbound",
)
assert.equal(
  buildCtbEtaApiUrl(base, "001234", "20A"),
  "https://rt.data.gov.hk/v2/transport/citybus/eta/ctb/001234/20A",
)
assert.equal(
  buildCtbEtaApiUrl(base, "STOP/A", "20A"),
  "https://rt.data.gov.hk/v2/transport/citybus/eta/ctb/STOP%2FA/20A",
)

console.log("CTB API URL validation passed")
