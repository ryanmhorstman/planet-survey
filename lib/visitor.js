// What standing on a world would be like for an unprotected person, and how
// it compares with Earth. Everything here is read from the calculated
// physics; the human limits are textbook values, so the result is a rough
// estimate for a person in ordinary clothes, without a suit or breathing gear.
import { starAppearance, formatQuantity } from "./planet.js";

const EARTH_YEAR_DAYS = 365.25;
// Below the Armstrong limit (6.3 kPa) water boils at body temperature.
const ARMSTRONG_BAR = 0.063;

/** @param {number} n */
const about = (n) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 1 : 0 });

/** "2.9× as wide as the Sun", or the plain phrase when the ratio is near 1.
 * @param {number} ratio @param {string} unit @param {string} same */
const times = (ratio, unit, same) =>
  Math.abs(ratio - 1) < 0.05 ? same : `${about(ratio)}× ${unit}`;

/** @param {number} seconds */
export function lasting(seconds) {
  if (seconds < 60) return `about ${seconds} seconds`;
  if (seconds < 3600) return "a few minutes";
  if (seconds < 86400) return "a few hours";
  return "a few days";
}

/**
 * The hazards that would end an unprotected visit, fastest first. Each has a
 * representative time to serious harm in seconds.
 * @param {import("./planet.js").Params} p @param {any} physics
 * @returns {{seconds: number, text: string}[]}
 */
export function hazards(p, physics) {
  const out = [],
    t = physics.temperatureC,
    airless = p.atmosphere.includes("none"),
    gas = p.atmosphere.includes("hydrogen"),
    oxygen = p.atmosphere.startsWith("nitrogen-oxygen")
      ? 0.21 * p.pressureBar
      : 0;
  // NASA: about 15 seconds of useful consciousness in vacuum.
  if (airless || p.pressureBar < ARMSTRONG_BAR)
    out.push({
      seconds: 15,
      text: "With almost no air pressure, you'd black out in about 15 seconds as the water in your body starts to boil.",
    });
  else if (!oxygen)
    out.push({
      seconds: 30,
      text: `The air has no oxygen${p.atmosphere.includes("CO2") ? " and is mostly carbon dioxide" : ""}: you'd black out within a few breaths.`,
    });
  // Everest's summit is about 0.33 bar, 0.07 bar of oxygen.
  else if (oxygen < 0.06)
    out.push({
      seconds: 600,
      text: "The air is thinner than at the top of Everest: you'd collapse within minutes.",
    });
  else if (oxygen < 0.12)
    out.push({
      seconds: 3 * 86400,
      text: "The air is as thin as on a high mountain: altitude sickness within hours.",
    });
  // Divers convulse above about 1.6 bar of oxygen.
  else if (oxygen > 1.6)
    out.push({
      seconds: 1800,
      text: "So much oxygen is toxic: seizures within about half an hour.",
    });
  if (p.pressureBar > 10)
    out.push({
      seconds: 30,
      text: `The air presses as hard as the ocean ${about(p.pressureBar * 10)} m down.`,
    });
  // A dry sauna near 90 °C is bearable for about 15 minutes.
  if (t >= 300)
    out.push({
      seconds: 5,
      text: `At ${formatQuantity("temperatureC", t)} °C, you'd burn within seconds.`,
    });
  else if (t >= 100)
    out.push({
      seconds: 300,
      text: `At ${formatQuantity("temperatureC", t)} °C, hotter than boiling water, you'd burn within minutes.`,
    });
  else if (t >= 45)
    out.push({
      seconds: 3 * 3600,
      text: `At ${formatQuantity("temperatureC", t)} °C, heatstroke would set in within hours.`,
    });
  else if (t <= -60)
    out.push({
      seconds: 600,
      text: `At ${formatQuantity("temperatureC", t)} °C, exposed skin freezes within minutes.`,
    });
  else if (t <= -20)
    out.push({
      seconds: 2 * 3600,
      text: `At ${formatQuantity("temperatureC", t)} °C, hypothermia would set in within hours.`,
    });
  if (physics.gravityG > 3)
    out.push({
      seconds: 86400,
      text: `At ${about(physics.gravityG)} g you could barely lift your own body, and your heart would strain to pump blood to your head.`,
    });
  if (gas)
    out.push({
      seconds: 3600,
      text: "There is no surface: you'd sink through ever deeper, hotter clouds until crushed.",
    });
  return out.sort((a, b) => a.seconds - b.seconds);
}

/**
 * @param {import("./planet.js").Params} p @param {any} physics
 */
export function survival(p, physics) {
  const list = hazards(p, physics),
    t = physics.temperatureC,
    // The temperature is a global mean; a locked world's two sides differ.
    sides =
      physics.tidalLock?.locked || physics.solarDayHours == null
        ? " These use the global mean: the dayside would be hotter and the nightside colder."
        : "";
  if (list.length)
    return {
      survivable: false,
      headline: `Unprotected, you'd last ${lasting(list[0].seconds)}.`,
      reasons: [
        ...list.map((hazard) => hazard.text),
        ...(sides ? [sides.trim()] : []),
      ],
    };
  const clothes =
    t < 0
      ? "in a heavy winter coat"
      : t < 12
        ? "in a warm jacket"
        : t < 26
          ? "in a light jacket or shirt sleeves"
          : "in light clothes, staying in the shade";
  return {
    survivable: true,
    headline: `You could walk around here ${clothes}.`,
    reasons: [
      `${physics.waterState === "Liquid water plausible" ? "The air is breathable and liquid water is plausible" : "The air is breathable, but there may be no liquid water to drink"}. Radiation, toxins and microbes are not modeled.${sides}`,
    ],
  };
}

/**
 * Earth-relative facts for a visitor.
 * @param {import("./planet.js").Params} p @param {any} physics
 * @returns {{label: string, value: string}[]}
 */
export function earthComparison(p, physics) {
  const g = physics.gravityG,
    star = starAppearance(p, physics),
    sunlight = physics.star.luminosity / physics.au ** 2,
    gas = p.atmosphere.includes("hydrogen"),
    years = physics.yearDays / EARTH_YEAR_DAYS;
  return [
    {
      label: "Your weight",
      value: `A 70 kg person would feel like ${about(70 * g)} kg${gas ? " at the cloud tops" : ""}.`,
    },
    {
      label: "Jumping",
      value:
        g < 1
          ? `You could jump ${about(1 / g)}× as high as on Earth.`
          : g > 1
            ? `You could jump only ${about(100 / g)}% as high as on Earth.`
            : "You'd jump just as high as on Earth.",
    },
    {
      label: "A year",
      value:
        years < 2
          ? `${about(physics.yearDays)} Earth days.`
          : `${about(years)} Earth years.`,
    },
    {
      label: "Your age",
      value: `If you're 30 on Earth, you'd be ${about((30 * EARTH_YEAR_DAYS) / physics.yearDays)} here.`,
    },
    {
      label: "A day",
      value:
        physics.solarDayHours == null
          ? "The star never moves: one side has endless day, the other endless night."
          : `Sunrise to sunrise takes ${about(physics.solarDayHours)} hours.`,
    },
    {
      label: "The star",
      value: `It looks ${times(star.widthVsSun, "as wide as the Sun", "about the size of the Sun")}, and the planet gets ${times(sunlight, "Earth's sunlight", "about Earth's sunlight")}.`,
    },
    ...locals(p, physics),
  ];
}

/**
 * What a visitor would make of the imagined builders, from the gravity they
 * built for.
 * @param {import("./planet.js").Params} p @param {any} physics
 */
function locals(p, physics) {
  const level = p.civilization ?? "none",
    g = physics.gravityG;
  if (level === "none") return [];
  if (level === "ruins")
    return [
      {
        label: "The locals",
        value:
          "Long gone. Only their ruins remain, built for this world's gravity.",
      },
    ];
  return [
    {
      label: "The locals",
      value:
        g > 1.5
          ? "They build low and heavy for strong gravity: mind your head in their doorways."
          : g < 0.7
            ? "They build tall and light for weak gravity: every step on their stairs is a climb for you."
            : "They build for gravity close to Earth's, so their doorways would fit you.",
    },
  ];
}
