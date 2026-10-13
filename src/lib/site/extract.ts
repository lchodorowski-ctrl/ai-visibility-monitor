const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const dropBlocks = (s: string) => s.replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, " ");

export function extractPage(html: string): { title: string | null; h1: string | null; description: string | null; excerpt: string } {
  if (!html) return { title: null, h1: null, description: null, excerpt: "" };
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const description = html.match(/<meta[^>]+name=["']description["'][^>]*content=(["'])(.*?)\1/i)?.[2]
    ?? html.match(/<meta[^>]+content=(["'])(.*?)\1[^>]*name=["']description["']/i)?.[2];
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const excerpt = stripTags(dropBlocks(main)).slice(0, 600);
  return { title: title ? stripTags(title) : null, h1: h1 ? stripTags(h1) : null, description: description ? decode(description).trim() : null, excerpt };
}
