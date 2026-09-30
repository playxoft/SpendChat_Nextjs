import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { ElectricityTool } from "./_components/electricity-tool";

const SLUG = "electricity-cost-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How much does it cost to run an AC per hour?",
    a: "Multiply its power in kilowatts by your price per kWh. A 1.5-ton (18,000 BTU) air conditioner draws roughly 1.5 kW while the compressor runs, so an hour costs about 1.5 × your price: 12 at 8 rupees a unit, or about 26 cents at $0.17 per kWh. A 1-ton unit draws about 1 kW. Inverter models draw less once the room has cooled down.",
  },
  {
    q: "How do I calculate kWh?",
    a: "Multiply the appliance's watts by the hours it runs, then divide by 1,000. A 100 W TV on for 5 hours uses 100 × 5 ÷ 1,000 = 0.5 kWh. Multiply that by your price per kWh to get the cost.",
  },
  {
    q: "How much electricity does a fridge use?",
    a: "A typical fridge-freezer uses about 1–2 kWh a day. It doesn't run constantly: the compressor switches on and off to hold the temperature, so its average draw across the day is far below its rating. The preset uses a 75 W average (1.8 kWh a day). Your fridge's energy label gives its yearly kWh — divide by 365 for a daily figure.",
  },
  {
    q: "What is a unit of electricity?",
    a: "One unit is one kilowatt-hour (kWh): 1,000 watts running for one hour, or a 100 W appliance for ten hours. Bills in India and many other countries count units; the price per unit is the price per kWh.",
  },
  {
    q: "How much does it cost to run a heater?",
    a: "A 2,000 W (2 kW) room heater uses 2 kWh every hour it runs at full power — 0.60 an hour at 0.30 per kWh, or 16 an hour at 8 per unit. Its thermostat cuts the power once the room is warm, so a heater on for four hours may only draw full power for part of that time.",
  },
  {
    q: "Why is my electricity bill higher than the calculator says?",
    a: "Bills add a fixed or standing charge and taxes, and many tariffs charge more per unit as use goes up (slabs or tiers) or at peak times. Appliances you didn't list, standby power, and heating or cooling running longer in extreme weather all add to it too.",
  },
];

export default function ElectricityCostCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Want the power bill next to everything else you spend?"
      faqs={faqs}
      intro={
        <p>
          Add your appliances, enter what you pay per kWh, and see what each one costs to run per
          hour, day, month and year — and which one is behind most of your bill.
        </p>
      }
      tool={<ElectricityTool />}
    >
      <ToolSection title="How to use the electricity cost calculator">
        <p>
          Enter your electricity price per kWh (one unit) from your bill, and pick the currency.
          Then choose each appliance from the list: its watts and usual hours a day fill in with
          typical figures, which you can change to match yours. Set how many you have — five
          bulbs, two fans — add as many appliances as you like, and remove the ones you
          don&apos;t need.
        </p>
        <p>
          The total updates as you type, and the list under it ranks your appliances by monthly
          cost so the biggest one stands out. Copy link saves the whole list.
        </p>
      </ToolSection>

      <ToolSection title="The formula">
        <Formula>
          kWh per day = watts × hours a day × quantity ÷ 1,000
          <br />
          cost per day = kWh per day × price per kWh
          <br />
          cost per year = cost per day × 365
          <br />
          cost per month = cost per year ÷ 12
        </Formula>
        <p>
          A month here is an average month — a twelfth of a 365-day year, about 30.4 days — so
          twelve months always add up to the yearly figure. The cost per hour is simply the
          appliance&apos;s kilowatts × your price.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: a 1.5-ton AC, 8 hours a day">
        <p>
          A 1.5-ton air conditioner draws about 1,500 W. Running 8 hours a day, it uses 1,500 × 8
          ÷ 1,000 = 12 kWh a day, or 12 × 365 ÷ 12 = 365 kWh a month.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-medium text-foreground">At ₹8 per unit:</strong> ₹12 an
            hour, ₹96 a day, ₹2,920 a month, ₹35,040 a year.
          </li>
          <li>
            <strong className="font-medium text-foreground">At $0.17 per kWh:</strong> about 26
            cents an hour, $2.04 a day, $62.05 a month, $744.60 a year.
          </li>
        </ul>
        <p>
          Same appliance, same hours — the price per kWh decides the bill, which is why the
          calculator asks for yours instead of assuming one.
        </p>
      </ToolSection>

      <ToolSection title="Finding the real wattage — and the power you don't see">
        <p>
          The typical figures are a starting point. Your appliance&apos;s rating plate or
          charger shows its power in W or kW. If it only gives amps, watts ≈ volts × amps (230 V
          in most countries, 120 V in North America) — but that&apos;s the maximum, and
          appliances with a motor or thermostat average less. An energy label that gives yearly
          kWh is the most accurate number of all: yearly kWh × 1,000 ÷ 8,760 is the average
          watts to enter with 24 hours a day.
        </p>
        <p>
          Standby power adds up too. A TV, set-top box, speaker or charger left plugged in draws
          about 0.5–5 W each, all day. Ten devices at 2 W is 0.48 kWh a day — around 175 kWh a
          year. Add them as one custom row running 24 hours to see what they cost you.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
