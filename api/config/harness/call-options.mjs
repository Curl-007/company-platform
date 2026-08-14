export const name = "company-call-options";
export const inject = ["agents"];

export function apply(ctx) {
  const configured = Number(process.env.DSH_TEMPERATURE);
  const temperature = Number.isFinite(configured) ? configured : 0.2;

  ctx.on("agent/request", async (_payload, next) => ({
    ...(await next()),
    temperature,
  }));
}
