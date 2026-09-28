/**
 * Starting points for `/tools/electricity-cost-calculator`: common household
 * appliances with a *typical* power draw and a typical day's use.
 *
 * These are ballpark figures for a mid-range model, not measurements — real
 * appliances vary by size, age and efficiency rating, which is why the page
 * pre-fills them into editable fields and tells people to check the label.
 * Where an appliance cycles on and off (a fridge), the figure is its average
 * draw across the day, not the compressor's rating.
 *
 * `id`s appear in shared links (`?a=fridge~75~24~1`), so they are short and
 * must never be renamed or reused.
 */

export type AppliancePreset = {
  /** Short, stable id — part of every shared link. */
  id: string;
  label: string;
  /** Typical power while running, in watts (or the 24-hour average, for cycling appliances). */
  watts: number;
  /** Typical hours of use per day, pre-filled alongside the watts. */
  hours: number;
  /** One line under the watts field when the typical figure needs a caveat. */
  note?: string;
};

export const APPLIANCES: readonly AppliancePreset[] = [
  {
    id: "ac1",
    label: "Air conditioner, 1 ton (12,000 BTU)",
    watts: 1000,
    hours: 8,
    note: "Inverter models draw less once the room is cool.",
  },
  {
    id: "ac15",
    label: "Air conditioner, 1.5 ton (18,000 BTU)",
    watts: 1500,
    hours: 8,
    note: "Inverter models draw less once the room is cool.",
  },
  { id: "cooler", label: "Air cooler (evaporative)", watts: 200, hours: 8 },
  { id: "fan", label: "Ceiling fan", watts: 75, hours: 10 },
  { id: "bldc", label: "Ceiling fan, energy-saving (BLDC)", watts: 30, hours: 10 },
  {
    id: "heater",
    label: "Room heater",
    watts: 2000,
    hours: 3,
    note: "Its thermostat cuts in and out, so real use is often lower.",
  },
  { id: "geyser", label: "Water heater / geyser", watts: 2000, hours: 1 },
  {
    id: "fridge",
    label: "Fridge-freezer",
    watts: 75,
    hours: 24,
    note: "Average over the day — the compressor cycles on and off.",
  },
  { id: "wash", label: "Washing machine", watts: 500, hours: 1 },
  { id: "dryer", label: "Tumble dryer", watts: 2500, hours: 1 },
  { id: "dish", label: "Dishwasher", watts: 1200, hours: 1 },
  { id: "micro", label: "Microwave", watts: 1200, hours: 0.25 },
  { id: "oven", label: "Electric oven", watts: 2400, hours: 0.5 },
  { id: "induct", label: "Induction cooktop", watts: 1800, hours: 1 },
  { id: "kettle", label: "Electric kettle", watts: 2000, hours: 0.2 },
  { id: "iron", label: "Clothes iron", watts: 1000, hours: 0.25 },
  { id: "hair", label: "Hair dryer", watts: 1500, hours: 0.15 },
  { id: "tv", label: "TV (LED, 40–55 inch)", watts: 100, hours: 4 },
  { id: "laptop", label: "Laptop", watts: 50, hours: 6 },
  { id: "pc", label: "Desktop PC and monitor", watts: 200, hours: 4 },
  { id: "router", label: "Wi-Fi router", watts: 10, hours: 24 },
  { id: "phone", label: "Phone charger", watts: 10, hours: 2 },
  { id: "led", label: "LED bulb", watts: 9, hours: 6 },
  { id: "pump", label: "Water pump (1 HP)", watts: 750, hours: 0.5 },
  { id: "ev", label: "EV home charger (7 kW)", watts: 7000, hours: 2 },
];

/** The id for a row whose watts the visitor typed themselves. */
export const CUSTOM_APPLIANCE = "custom";

const BY_ID = new Map(APPLIANCES.map((a) => [a.id, a]));

export function getAppliance(id: string): AppliancePreset | undefined {
  return BY_ID.get(id);
}
