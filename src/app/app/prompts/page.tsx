import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { addTopic, addPrompt, togglePromptActive, togglePromptKey, deletePrompt } from "./actions";

const INTENTS = { informational: "informacyjna", comparison: "porównawcza", transactional: "zakupowa", brand: "brandowa" } as const;

export default async function PromptsPage() {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const [{ data: topics, error: topicsError }, { data: prompts, error: promptsError }] = await Promise.all([
    supabase.from("topics").select("*").eq("project_id", project.id).order("name"),
    supabase.from("prompts").select("*").eq("project_id", project.id).order("created_at"),
  ]);
  if (topicsError) throw new Error(topicsError.message);
  if (promptsError) throw new Error(promptsError.message);
  const topicName = new Map((topics ?? []).map((t) => [t.id, t.name]));
  const topicItems = [{ value: "", label: "(bez tematu)" }, ...(topics ?? []).map((t) => ({ value: t.id, label: t.name }))];
  const intentItems = Object.entries(INTENTS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Prompty ({prompts?.length ?? 0})</h1>
        <Link href="/app/prompts/generate" className={buttonVariants()}>Generuj propozycje</Link>
      </div>

      <form action={addPrompt} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 text-sm">
        <Input name="text" required placeholder="Nowe pytanie…" aria-label="Nowe pytanie" />
        <Select name="topic_id" defaultValue="" items={topicItems}>
          <SelectTrigger aria-label="Temat" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {topicItems.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select name="intent" defaultValue="informational" items={intentItems}>
          <SelectTrigger aria-label="Intencja" className="min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {intentItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Label className="flex items-center gap-1"><Checkbox name="is_key" /> kluczowy</Label>
        <Button type="submit">Dodaj</Button>
      </form>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pytanie</TableHead>
                <TableHead>Temat</TableHead>
                <TableHead>Intencja</TableHead>
                <TableHead>Kluczowy</TableHead>
                <TableHead>Aktywny</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(prompts ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-normal">{p.text}</TableCell>
                  <TableCell>{p.topic_id ? topicName.get(p.topic_id) : "—"}</TableCell>
                  <TableCell>{INTENTS[p.intent as keyof typeof INTENTS]}</TableCell>
                  <TableCell>
                    <form action={togglePromptKey}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="is_key" value={String(!p.is_key)} />
                      <Button type="submit" variant="ghost" size="sm">{p.is_key ? "★ 3 próbki" : "☆"}</Button>
                    </form>
                  </TableCell>
                  <TableCell>
                    <form action={togglePromptActive}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={String(!p.active)} />
                      <Button type="submit" variant="ghost" size="sm" className={p.active ? "text-green-700" : "text-muted-foreground"}>{p.active ? "tak" : "nie"}</Button>
                    </form>
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={deletePrompt}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" variant="destructive" size="sm">Usuń</Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <section>
        <h2 className="font-semibold">Tematy</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {(topics ?? []).map((t) => <li key={t.id}><Badge variant="secondary">{t.name}</Badge></li>)}
        </ul>
        <form action={addTopic} className="mt-2 flex gap-2 text-sm">
          <Input name="name" required placeholder="Nowy temat" aria-label="Nowy temat" className="max-w-xs" />
          <Button type="submit" variant="outline">Dodaj temat</Button>
        </form>
      </section>
    </div>
  );
}
