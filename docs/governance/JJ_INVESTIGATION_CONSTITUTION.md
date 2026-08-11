# JJ Investigation Constitution (Canonical — Git Authority)

> **Status:** Git-backed authority (Phase 2A promotion, 2026-08-11).
> **Faithful promotion** of the Investigation-Constitution rules within `CLAUDE.md §13.17` — text preserved, no approved rule rewritten.
> **Scope:** P-EVIDENCE-1 (Evidence Question Rule) + Resolution Governance Rule.
> **Origin / provenance:** `AV005_LEDGER.md`; `CLAUDE.md §13.17`. Legacy §13.17 remains source/provenance during migration; this file is the durable authority for the promoted material.
> **Ledger Constitution** (P-LEDGER-1…6, D4) is in `docs/governance/JJ_LEDGER_CONSTITUTION.md`.

---

### P-EVIDENCE-1 — Evidence Question Rule (אושר 26 יולי 2026)

> **Evidence collection always begins with a business question.**
>
> Never begin from a document. Never begin from a row. Begin from the business fact that must be proven.

**זרימת חקירה (7 שלבים מחייבים):**
```
Business Question → Evidence Sources → Evidence Collection
→ Evidence Evaluation → Evidence Outcome → Ledger Impact
→ Architecture Impact (Expected: NONE)
```

**ארבע תוצאות מותרות בלבד:**
`Confirmed Fact` | `Confirmed Duplicate` | `Confirmed Separate Events` | `Unknown`

`Unknown` היא תוצאה שלמה וחוקית. כל תוצאה חמישית ("כנראה", "נראה ש...") אסורה.

**כלל מחייב:** הסעיף האחרון בכל Evidence Item חייב להיות `Architecture impact: NONE`. אם לא — עוצרים ומחקירים, לא משנים ארכיטקטורה.

### Resolution Governance Rule (אושר 26 יולי 2026)

לאחר שהארכיטקטורה ננעלת, העבודה היא Business Investigation בתוך מסגרת קבועה.

```
Evidence resolves facts.

Decisions resolve agreements.

Architecture resolves neither.
```

| סוג | מה הוא משנה | מה הוא אינו יכול לשנות |
|-----|------------|----------------------|
| **Evidence** | מצב עובדתי של שורה או אירוע | המודל, העקרונות, השערים |
| **Decision** | הסכם שאין עליו אמת עובדתית אחת | עקרונות חוקתיים; עובדות שכבר אושרו |
| **Architecture** | המסגרת שבה Evidence ו-Decision נרשמים | שום דבר — היא ה-container, לא ה-content |

**כלל מחייב:** כל מנוע עתידי חייב ליישם את הסדר:
```
Identify transaction → Qualify event → Preserve cash reality
→ Determine economic bearer → Determine settlement counterparty → Calculate settlement
```

לא:
```
Import rows → Sum by payer → Infer who owes whom
```
