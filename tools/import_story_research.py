#!/usr/bin/env python3
"""Build data/story-jobs.csv from the story-job research files (todo branch, StoryJobResearch/):
   story-job-emails.md (one "## N. Subject" entry per email) and story-job-chains.md (chains + standalone, quest order).

   python3 tools/import_story_research.py <story-job-emails.md> <story-job-chains.md>

Text is copied exactly – body paragraphs stay (blank lines), objectives one per line. Nothing is invented."""
import csv, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "story-jobs.csv"
COLS = ["id", "chain", "chain_order", "email", "signed", "subject", "level", "labour", "budget", "objectives", "body"]


def parse_emails(text):
    jobs = {}
    for part in re.split(r"(?m)^## (?=\d+\. )", text)[1:]:
        head, rest = part.split("\n", 1)
        n, subject = re.match(r"(\d+)\. (.*)$", head).groups()
        m = re.search(r'(?ms)^- From: (.*?)\n- Body: (.*?)\n- Req level:(.*?)\n- Labour:(.*?)\n- Budget:(.*?)\n- Objectives:\n?(.*)$', rest)
        if not m:
            sys.exit(f"entry {n}: unexpected layout")
        frm, body, level, labour, budget, objs = m.groups()
        # the body is quoted; a few entries describe it instead ("…" repeated about 45 times) – kept as written
        if len(body) >= 2 and body[0] == '"' and body[-1] == '"':
            body = body[1:-1]
        fm = re.match(r"(\S+)(?: \(signed (.*)\))?$", frm.strip())
        objectives = [re.sub(r"^  - ", "", l) for l in objs.rstrip().split("\n") if l.strip()]
        bad = [l for l in objs.rstrip().split("\n") if l.strip() and not l.startswith("  - ")]
        if bad:
            sys.exit(f"entry {n}: odd objective lines {bad}")
        jobs[int(n)] = {
            "id": int(n), "email": fm.group(1), "signed": fm.group(2) or "", "subject": subject.strip(),
            "level": level.strip(), "labour": labour.strip().lstrip("$").replace(",", ""),
            "budget": budget.strip().lstrip("$").replace(",", ""), "objectives": "\n".join(objectives), "body": body,
        }
    return jobs


def parse_chains(text):
    order = {}  # id -> (chain name, position)
    for part in re.split(r"(?m)^## ", text)[1:]:
        head, rest = part.split("\n", 1)
        name = re.sub(r"^Chain \d+:\s*", "", head.strip())
        standalone = head.lower().startswith("standalone")
        ids = [int(x) for x in re.findall(r"(?m)^\s*(?:\d+\.|-) #(\d+) ", rest)]
        for pos, i in enumerate(ids, 1):
            if i in order:
                sys.exit(f"#{i} is in two groups")
            order[i] = ("" if standalone else name, pos)
    return order


def main():
    emails, chains = Path(sys.argv[1]).read_text(encoding="utf-8"), Path(sys.argv[2]).read_text(encoding="utf-8")
    jobs, order = parse_emails(emails), parse_chains(chains)
    missing = sorted(set(jobs) - set(order))
    extra = sorted(set(order) - set(jobs))
    if missing or extra:
        sys.exit(f"not in the chains file: {missing}; not in the emails file: {extra}")
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, COLS, lineterminator="\n")
        w.writeheader()
        for i in sorted(jobs):
            chain, pos = order[i]
            w.writerow({**jobs[i], "chain": chain, "chain_order": pos})
    print(f"wrote {OUT.relative_to(ROOT)}: {len(jobs)} story jobs, {len({c for c, _ in order.values() if c})} chains")


if __name__ == "__main__":
    main()
