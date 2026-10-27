/* Await the app's public async commit boundary without changing assertions or locks. */
async function trackPage(page) {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem,
      read = Storage.prototype.getItem;
    window.ritimSessionWrite = (object, args) => write.apply(object, args);
    window.ritimSessionRead = (object, args) => read.apply(object, args);
  });
  const evaluate = page.evaluate.bind(page);
  const idle = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await evaluate(() => window.RitimConcurrencyUI?.idle());
      } catch (e) {
        if (
          attempt === 2 ||
          !/Execution context was destroyed|Cannot find context/.test(e.message)
        )
          throw e;
        // Recovery copy intentionally navigates to a new dataset URL. Wait for that document only.
        await page.waitForLoadState("domcontentloaded");
      }
    }
  };
  page.evaluate = async (...args) => {
    await idle();
    const r = await evaluate(...args);
    await idle();
    return r;
  };
  const chain = new Set([
    "locator",
    "getByRole",
    "getByText",
    "getByLabel",
    "getByPlaceholder",
    "getByTestId",
    "filter",
    "first",
    "last",
    "nth",
    "and",
    "or",
  ]);
  const actions = new Set([
    "click",
    "dblclick",
    "fill",
    "selectOption",
    "check",
    "uncheck",
    "press",
    "setInputFiles",
  ]);
  const wrap = (target) =>
    new Proxy(target, {
      get(object, key) {
        const member = Reflect.get(object, key);
        if (typeof member !== "function") return member;
        if (chain.has(key))
          return (...args) => wrap(member.apply(object, args));
        if (actions.has(key))
          return async (...args) => {
            await idle();
            const r = await member.apply(object, args);
            await idle();
            return r;
          };
        return member.bind(object);
      },
    });
  for (const name of [
    "locator",
    "getByRole",
    "getByText",
    "getByLabel",
    "getByPlaceholder",
    "getByTestId",
  ]) {
    const original = page[name].bind(page);
    page[name] = (...args) => wrap(original(...args));
  }
  return page;
}
module.exports = { trackPage };
