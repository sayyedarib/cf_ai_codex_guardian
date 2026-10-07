/** Turns a title into a readable, URL-safe id: "No console.log!" -> "no-console-log". */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "rule"
  );
}

/** Slug of `title` that does not collide with `taken` (adds -2, -3, ...). */
export function uniqueSlug(title: string, taken: ReadonlySet<string>): string {
  const base = slugify(title);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Short random id with a prefix. Also valid as a Workflow instance id. */
export function randomId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}-${time}${rand}`;
}
