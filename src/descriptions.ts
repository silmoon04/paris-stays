export type DescriptionBlock = { kind: "heading" | "paragraph" | "list"; text?: string; items?: string[] };
export function descriptionBlocks(raw: string): DescriptionBlock[] {
  const sections = ["The space", "Guest access", "Other things to note", "Interaction with guests"];
  let text = raw.replace(/\r\n?/g, "\n");
  for (const heading of sections) text = text.replace(new RegExp(heading, "g"), `\n\n## ${heading}\n\n`);
  text = text.replace(/\s*-\s+(?=[A-Z])/g, "\n- ").replace(/([.!?])(?=[A-Z][a-z])/g, "$1 ");
  const result: DescriptionBlock[] = [];
  for (const line of text.split(/\n+/).map(x => x.trim()).filter(Boolean)) {
    if (line.startsWith("## ")) result.push({ kind: "heading", text: line.slice(3) });
    else if (line.startsWith("- ")) {
      const previous = result[result.length - 1];
      if (previous?.kind === "list") previous.items!.push(line.slice(2));
      else result.push({ kind: "list", items: [line.slice(2)] });
    } else {
      const sentences = line.split(/(?<=[.!?])\s+(?=[A-Z])/);
      for (let i = 0; i < sentences.length; i += 3) result.push({ kind: "paragraph", text: sentences.slice(i, i + 3).join(" ").trim() });
    }
  }
  return result;
}
