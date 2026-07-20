function createDateHelpers({ now }) {
  function isoDateOnly(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return now().slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function weekKeyOf(value) {
    const date = new Date(`${isoDateOnly(value)}T00:00:00.000Z`);
    const day = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - day);
    return date.toISOString().slice(0, 10);
  }

  return { isoDateOnly, weekKeyOf };
}

module.exports = { createDateHelpers };
