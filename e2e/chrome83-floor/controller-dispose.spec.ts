import { test, expect } from "@playwright/test";

test("destroy() 후 scrollTo는 상태를 바꾸지 않고 subscribe도 더 이상 통지하지 않는다", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    () => window.__scrollaController?.getState().overflow.vertical === true,
  );

  const before = await page.evaluate(
    () => window.__scrollaController?.getState().position.y ?? -1,
  );

  const notifiedAfterDestroy = await page.evaluate(() => {
    const controller = window.__scrollaController;
    if (controller === undefined) {
      return true;
    }
    let notifiedCount = 0;
    const unsubscribe = controller.subscribe(() => {
      notifiedCount += 1;
    });
    controller.destroy();
    controller.scrollTo({ y: 999 });
    unsubscribe();
    return notifiedCount > 0;
  });
  expect(notifiedAfterDestroy).toBe(false);

  const after = await page.evaluate(
    () => window.__scrollaController?.getState().position.y ?? -1,
  );
  expect(after).toBe(before);
});
