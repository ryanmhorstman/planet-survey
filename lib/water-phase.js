// Versioned educational phase approximation. Preserve v1 for persisted worlds.
export function waterStateV1(temperature, pressure, water) {
  if (!water) return "No exposed water assigned";
  if (
    !Number.isFinite(temperature) ||
    !Number.isFinite(pressure) ||
    temperature < -273.15 ||
    pressure < 0
  )
    return "Water phase outside model range";
  if (pressure < 0.00612) return "Exposed liquid unstable";
  if (temperature >= 373.946 && pressure >= 220.64)
    return "Supercritical conditions possible";
  if (pressure >= 220.64) return "Water phase outside model range";
  if (temperature < 0) return "Ice favored";
  // Antoine coefficients: 1–100°C and 99–374°C respectively (mmHg).
  // Beyond these saturation domains, do not extrapolate liquid plausibility.
  if (temperature >= 373.946) return "Vapor favored";
  const [a, b, c] =
    pressure <= 1 ? [8.07131, 1730.63, 233.426] : [8.14019, 1810.94, 244.485];
  const boiling = b / (a - Math.log10(pressure * 750.062)) - c;
  if (boiling < 1 || boiling > 373.946)
    return "Water phase outside model range";
  return temperature > boiling ? "Vapor favored" : "Liquid water plausible";
}
