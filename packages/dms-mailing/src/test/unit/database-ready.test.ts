import { expect } from "chai";
import { createReadyGate } from "../../hooks/database-ready";

describe("[unit] hooks/database-ready", () => {
  it("holds calls until the gate opens, then runs them in order", async () => {
    const gate = createReadyGate();
    const ran: number[] = [];
    const task = gate.after(async (value: number) => {
      ran.push(value);
      return value * 2;
    });
    const first = task(1);
    const second = task(2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(ran).to.deep.equal([]);
    gate.open();
    expect(await Promise.all([first, second])).to.deep.equal([2, 4]);
    expect(ran).to.deep.equal([1, 2]);
  });

  it("runs at once once open, and opening again changes nothing", async () => {
    const gate = createReadyGate();
    gate.open();
    gate.open();
    expect(await gate.after(async () => "done")()).to.equal("done");
  });

  it("passes a task's failure to its caller", async () => {
    const gate = createReadyGate();
    gate.open();
    const failing = gate.after(async () => {
      throw new Error("refused");
    });
    const error = await failing().catch((reason: Error) => reason);
    expect((error as Error).message).to.equal("refused");
  });
});
