import Link from "next/link";
import { Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

type Values = {
  view: string;
  q?: string;
  status?: string;
  priority?: string;
  category?: string;
  assignee?: string;
  team?: string;
  tag?: string;
  from?: string;
  to?: string;
  sort: string;
  dir: string;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const SORTS: [string, string][] = [
  ["updated", "Last updated"],
  ["created", "Created"],
  ["number", "Ticket number"],
  ["priority", "Priority"],
  ["status", "Status"],
  ["due", "Resolution due"],
];

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * A plain GET form: every filter ends up in the URL, so a filtered list can
 * be bookmarked or shared, and it works without JavaScript.
 */
export function TicketFilters({
  values,
  staff,
  options,
  clearHref,
  showClear,
}: {
  values: Values;
  staff: boolean;
  options: { categories: Option[]; tags: Option[]; teams: Option[]; assignees: Option[] };
  clearHref: string;
  showClear: boolean;
}) {
  return (
    <form method="get" action="/tickets" className="space-y-3 border-b p-4" role="search">
      {values.view !== "all" ? <input type="hidden" name="view" value={values.view} /> : null}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          name="q"
          type="search"
          aria-label="Search tickets"
          placeholder={
            staff
              ? "Search by ticket number, subject, description, reply or requester"
              : "Search by ticket number, subject, description or reply"
          }
          defaultValue={values.q ?? ""}
          maxLength={100}
          className="pl-8"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Field id="f-status" label="Status">
          <Select id="f-status" name="status" defaultValue={values.status ?? ""}>
            <option value="">Any status</option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="f-priority" label="Priority">
          <Select id="f-priority" name="priority" defaultValue={values.priority ?? ""}>
            <option value="">Any priority</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="f-category" label="Category">
          <Select id="f-category" name="category" defaultValue={values.category ?? ""}>
            <option value="">Any category</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        {staff ? (
          <>
            <Field id="f-assignee" label="Assignee">
              <Select id="f-assignee" name="assignee" defaultValue={values.assignee ?? ""}>
                <option value="">Anyone</option>
                <option value="me">Me</option>
                <option value="none">Unassigned</option>
                {options.assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="f-team" label="Team">
              <Select id="f-team" name="team" defaultValue={values.team ?? ""}>
                <option value="">Any team</option>
                {options.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="f-tag" label="Tag">
              <Select id="f-tag" name="tag" defaultValue={values.tag ?? ""}>
                <option value="">Any tag</option>
                {options.tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}

        <Field id="f-from" label="Created from">
          <Input id="f-from" name="from" type="date" defaultValue={values.from ?? ""} />
        </Field>

        <Field id="f-to" label="Created to">
          <Input id="f-to" name="to" type="date" defaultValue={values.to ?? ""} />
        </Field>

        <Field id="f-sort" label="Sort by">
          <Select id="f-sort" name="sort" defaultValue={values.sort}>
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="f-dir" label="Order">
          <Select id="f-dir" name="dir" defaultValue={values.dir}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Apply
        </Button>
        {showClear ? (
          <Link href={clearHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}
