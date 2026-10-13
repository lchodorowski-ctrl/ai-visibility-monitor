export function isAllowedByRobots(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  let inStar = false; const disallow: string[] = [];
  for (const line of lines) {
    const [key, ...rest] = line.split(":"); const value = rest.join(":").trim();
    if (key.toLowerCase() === "user-agent") inStar = value === "*";
    else if (inStar && key.toLowerCase() === "disallow" && value) disallow.push(value);
  }
  return !disallow.some((d) => path.startsWith(d));
}
