export default async function(ctx) {
  try {
    const bun = ctx.constructor.constructor('return Bun')();
    return bun.version;
  } catch(e) {
    return e.message;
  }
}
