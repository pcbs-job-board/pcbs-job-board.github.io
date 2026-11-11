/* 💡 Tips for a job – small reminders of things players often forget. They only inform: nothing else in the app
   reads them. To add one: a new entry with
     id   – short unique name
     when – (job, build) → true when the tip applies; build = the planned PC (customer's parts with the swaps applied)
     text – the tip (plain text)
   Helpers: hintObjs(j) = the job's objectives, hintSwap(build, cats) = a part swap planned for one of these categories. */
const hintObjs = j => jobObjectives(j).filter(o => !/^complete by/i.test(o));
const hintSwap = (build, cats) => build.some(p => p.swapped && cats.includes(p.cat));
const HINTS = [
  {
    id: "thermal-paste",
    when: (j, build) => hintSwap(build, ["Motherboard", "CPU", "CPU Cooler"]),
    text: "Motherboard, CPU or CPU cooler replaced – don't forget to apply thermal paste on the CPU before fitting the cooler.",
  },
  {
    id: "xmp-ram",
    when: j => hintObjs(j).some(o => /3\s?d\s?mark|\b(overclock\w*|oc)\b/i.test(o)),
    text: "More RAM sticks (more channels) and turning on XMP in the BIOS (RAM settings) both raise the 3DMark score. Customer PCs always come with XMP off.",
  },
  {
    id: "diagnose",
    when: j => hintObjs(j).some(o => /diagnose/i.test(o)),
    text: 'If "Diagnose and fix" stays unticked after the PC boots normally, run the virus scanner. If that doesn\'t help, one of the storage drives is most likely broken.',
  },
  {
    id: "story-budget",
    when: j => j.story && j.budget != null && !budgetInObjectives(hintObjs(j)),
    text: "Story job: the budget isn't binding – you can go over it and still get full marks (unless an objective mentions the budget).",
  },
  {
    id: "occt",
    when: j => hintObjs(j).some(o => /\b(overclock\w*|oc)\b/i.test(o)),
    text: "After overclocking, run the OCCT stress test to check the PC is stable, and watch the temperatures while it runs.",
  },
  {
    id: "pcbay-value",
    when: j => isFlip(j),
    text: "Sale price = (value of the used parts × a multiplier set by the 3DMark score) + $100 once it boots to the OS. The multiplier grows from 1× to 3× at 10,000 points – more than that adds nothing. The auction can still move the final price a little.",
  },
  {
    id: "leak-test",
    when: (j, build) => hintSwap(build, ["Water Cooling"]),
    text: "Custom water cooling: fill the loop with coolant and run the leak test before you boot the PC.",
  },
];
function jobHints(j) {
  const build = plannedBuild(j);
  return HINTS.filter(h => {
    try {
      return h.when(j, build);
    } catch {
      return false;
    }
  });
}
