# JJ Ledger Constitution (Canonical — Git Authority)

> **Status:** Git-backed authority (Phase 2A promotion, 2026-08-11).
> **Faithful promotion** of `CLAUDE.md §13.17` "Ledger & Settlement Constitutional Principles" — text preserved, no approved principle rewritten.
> **Scope:** P-LEDGER-1 … P-LEDGER-6 + D4 (JJ Entity Settlement Model).
> **Origin / provenance:** `AV005_LEDGER.md` (Reference Architecture for JJ Ledger Engine). Legacy `CLAUDE.md §13.17` remains source/provenance during migration; this file is the durable authority for the promoted material.
> **Excluded:** P-LEDGER-7 (Dimensional Measurement Authority) is **DRAFT and NOT authority** — see `docs/specifications/P_LEDGER_7_DRAFT.md` (unchanged).
> **Investigation Constitution** (P-EVIDENCE-1, Resolution Governance Rule) is intentionally split into `docs/governance/JJ_INVESTIGATION_CONSTITUTION.md`.
> **Current business/accounting rule registry** remains `docs/canonical/JJ_FINANCE_RULES.md`, which references this document; this file is authority/provenance, not a competing current-rules registry.

---

עקרונות אלו נולדו מניתוח AV-005 — Villa Mazotos Purchase & Capital. הם אינם ספציפיים לנכס אחד. הם מתארים דפוסים עסקיים שחוזרים על עצמם בכל עסקת רכישה, כניסת שותף, Working Fund, ו-Settlement ב-JJ.

**מקור:** `AV005_LEDGER.md` v5 — Reference Architecture for JJ Ledger Engine.

### שלוש שכבות ה-Constitution של JJ

| שכבה | מה היא מגדירה | עקרונות מרכזיים |
|------|-------------|----------------|
| **Engineering Constitution** | איך בונים מערכת | P-ARCH-1…9, ADR-001…006, FR-001, FR-002 |
| **Ledger Constitution** | איך מייצגים אירועים עסקיים | P-LEDGER-1, P-LEDGER-2, P-LEDGER-3, Six-Pass Model |
| **Investigation Constitution** | איך מגלים את האמת | P-EVIDENCE-1, Resolution Governance Rule, Phase 1 Rules |

כל שכבה נשענת על הקודמת ולא עוקפת אותה:

```
Authority (Engineering)
    ↓
Composition (Engineering)
    ↓
Ledger (Ledger)
    ↓
Investigation (Investigation)
```

### הפילוסופיה של JJ — משפט אחד

> **JJ does not search for documents.**
> **JJ searches for evidence that answers a business question.**

כל מסמך חדש שנכנס למערכת לא מתחיל תהליך של "קריאה" — מתחיל תהליך של Evidence Resolution לפי P-EVIDENCE-1 ושבעת השלבים.

---

### P-LEDGER — מסגרת מושגית

משפחת P-LEDGER אינה רשימת חוקים — היא מסגרת מושגית שכל עיקרון בה עונה על שאלה בסיסית אחת:

| עיקרון | השאלה שהוא עונה עליה |
|--------|----------------------|
| **P-LEDGER-1** | מי נושא במשמעות הכלכלית, ועם מי מתחשבנים? |
| **P-LEDGER-2** | מתי אירוע ראוי להיכנס ללדג'ר? |
| **P-LEDGER-3** | מתי מתחילה חקירה, ומה תנאי הכניסה שלה? |
| **P-LEDGER-4** | האם הכסף זמין לפעולה עסקית (Settlement) עכשיו? |
| **P-LEDGER-5** | האם האירוע משנה את המציאות הכלכלית, או רק את המיקום? |
| **P-LEDGER-6** | מהו הסכום הסמכותי לחישובים מול בעלים/לקוחות? |

**שלושה שלבי התפתחות של המשפחה:**
- P-LEDGER-1 עד 3: מגדירים **איך לפרש** כסף (interpretation)
- P-LEDGER-4 עד 5: מגדירים **איך להתנהג** עם כסף (behavior)
- P-LEDGER-6: מגדיר **באיזה מספר להשתמש** (measurement)

**כלל לסוכן:** לפני שמנוע חדש מטפל בכסף, הוא חייב לדעת לענות על כל שש השאלות. אם אחת מהן לא ברורה — אין להמשיך.

---

### P-LEDGER-1 — Three-Layer Settlement Rule

> **The economic bearer is not automatically the settlement counterparty.**

כל אירוע עסקי חייב להבחין בין שלושה שכבות עצמאיות:

| שכבה | שאלה |
|------|------|
| **Cash Reality** | מי שילם? מי קיבל? כמה? מתי? |
| **Economic Allocation** | מי נושא בעלות כלכלית, לפי איזה כלל? |
| **Settlement Counterparty** | עם מי מתחשבן הנושא הכלכלי בפועל? |

**השכבות האלו עשויות להיות זהות — אבל אסור להניח שהן זהות ללא ראיה מפורשת.**

**דוגמה (מאושרת):**
- אנסטסיה שילמה €2,400 (Cash Reality)
- אבי נושא ב-50% = €1,200 (Economic Allocation)
- הצד שאבי מתחשבן מולו הוא JJ — לא אנסטסיה (Settlement Counterparty)

**הוכח ב:** Villa Mazotos Purchase (AV-005), Anastasia Working Fund, JJ Internal Clearing, Partner Settlement.

**כלל מחייב:** כל מנוע Settlement, כל שירות Reporting, וכל DTO שחושף נתוני התחשבנות חייב לשמור על הפרדה מפורשת בין שלושת השכבות. אסור לקרוס אותן ללא governing evidence.

---

### P-LEDGER-2 — Ledger Qualification Rule

> **Nothing enters the ledger by proximity. Everything enters by qualification.**

אירוע לא שייך לעסקה בגלל שהוא חולק אותו נכס, אותו תאריך, או אותו משלם.
הוא שייך רק אחרי שעבר שני שערים מפורשים:

| שער | שאלה |
|-----|------|
| **PASS 0 — Transaction Identity** | האם הוא בתוך הזהות הקפואה של הלדג'ר הספציפי? |
| **PASS 1.25 — Cost Qualification** | האם הקישור הכלכלי שלו לעסקה מוכח בראיה? |

**דוגמאות לאירועים שנכשלים בשער זה:**
- הוצאות שיפוץ שנרשמו על אותו נכס — אינן חלק מעסקת הרכישה
- שורה עם תיאור עמום שחולקת תאריך עם הוצאת רכישה
- תשלום שנרשם בטעות על נכס אחר

**זהו ההבדל בין מערכת שעובדת לבין מערכת שאפשר לסמוך עליה בביקורת.**

**כלל מחייב:** כל Ledger Engine, כל Import Pipeline, וכל מנוע Reconciliation חייב לממש שני שערים אלו כתנאי כניסה — לא כשלב post-hoc.

---

### P-LEDGER-3 — Investigation Entry Condition (אושר 27 יולי 2026)

> **PASS 0 is not a step in an investigation.**
> **PASS 0 is the entry condition for an investigation.**
>
> Without PASS 0, there is no investigation.

**סיבה:** A skipped step can be bypassed. An entry condition cannot.

**PASS 0 קופא — לפני שאיסוף ראיות מתחיל:**
- Identity
- Scope
- Governing agreement
- Business scenario

**Constitutional Observation:**

> A wrong fact corrupts a calculation.
> A wrong scope corrupts an investigation.

שגיאות עובדתיות (Wrong Facts) ניתנות לגילוי בדרך כלל מבפנים — מספרים לא מסתדרים, סכום סותר חוזה, שרשרת ראיות שוברת. המערכת עצמה יכולה לזהות אותן.

שגיאות סקופ (Wrong Scope) נשארות לרוב עקביות פנימית. בתוך סקופ שגוי, כל המספרים עדיין מסתדרים, כל הראיות עדיין מתאימות — אין אות שגיאה פנימי. זו הסיבה שהן מסוכנות יותר.

**לכן:** Identity ו-Scope חייבים להיות קפואים לפני שאיסוף ראיות מתחיל. זו אינה המלצה. זו אילוץ חוקתי.

**Constitutional Consequence — Error Inheritance Chain:**

כל שכבה יורשת את גבול השגיאה שלה מהשכבה שמעליה.

```
Identity
    ↓
Scope
    ↓
Evidence
    ↓
Facts
    ↓
Ledger
    ↓
Decisions
    ↓
Settlement
```

כל שכבה מגבילה את מרחב השגיאה האפשרי של השכבה שמתחתיה.

זה אינו רק סדר ביצוע. זו ארכיטקטורת בלימת שגיאות של פלטפורמת JJ.

**כלל מחייב (Constitutional Constraint):** כל Ledger Engine, כל Evidence Engine, כל Settlement Engine, כל Audit Engine, כל Import Pipeline, וכל AI investigation agent חייבים לטפל ב-PASS 0 כתנאי כניסה מחייב — לא כשלב שניתן לדלג עליו. אם PASS 0 לא הושלם, אין חקירה.

> **הערת גבול עתידי (27 יולי 2026):** P-LEDGER-3 חוצה את גבולות ה-Ledger ומשפיע על Evidence, Audit, AI Agents, Import Pipelines, ו-Settlement. בעת רה-ארגון עתידי של משפחות העקרונות, ניתן להעביר אותו למשפחה חדשה (P-INVESTIGATION-1 או P-CONSTITUTION-1). עד אז, הוא נשמר תחת P-LEDGER-3 לשמירת המספור הקיים.

---

### P-LEDGER-4 — Settlement Availability Is a Distinct Axis (אושר 29 יולי 2026)

> **Economic ownership of cash does not automatically confer Settlement Availability.**

כל סכום כסף ב-JJ ניתן לתיאור בשלושה צירים עצמאיים:

| ציר | שאלה |
|-----|------|
| **Economic Ownership** | למי הכסף שייך? |
| **Custody / Location** | מי מחזיק בו ואיפה הוא נמצא פיזית? |
| **Settlement Availability** | האם ניתן לכלול אותו בהצעת Settlement עכשיו? |

**שלושת הצירים עצמאיים.** כסף יכול להיות: בבעלות JJ ✓, בידי אנסטסיה ✓, ולא זמין ל-Settlement ✓ — בו-זמנית.

**שני אירועים שמורידים Settlement Availability:**
1. **Approved Distribution** — כסף שאושר להפצה הופך "תפוס" לפני שהוא משולם. אסור לכלול אותו בהצעת Settlement נוספת.
2. **Custody עם גורם חיצוני** — כסף שמוחזק על ידי אנסטסיה (או כל גורם שאינו JJ) אינו זמין ל-Settlement עד שהוא מועבר לקופת JJ.

**חוזה מחייב (Settlement Balance Provider):**
```
compute_available_settlement_balance(entity_id, cutoff_date) → NUMERIC
= cashbox(entity) − approved_pending_distributions(entity)
```
זהו ה-interface היציב. כל מנוע Settlement קורא לחוזה בלבד — לא לנוסחה הפנימית.

**כלל מחייב:** כל Settlement Engine, כל Reporting Engine, כל Dashboard, וכל AI Agent חייבים להכיר בשלושת הצירים. אסור להציג "Balance = €X" ללא הבהרה של Settlement Availability. אסור לחלק כסף שאינו Settlement Available — גם אם הוא בבעלות JJ.

**מקור:** ADR-P2-006 (Settlement Calculation Policy), PQ-2 + PQ-3, שיחת יוסי 29 יולי 2026.

---

### P-LEDGER-5 — Transfer Is Not an Economic Event (אושר 29 יולי 2026)

> **A transaction with category='Transfer' changes custody and location. It never creates income, expense, profit, or loss.**

עסקת Transfer משנה:
- **Custodian** — מי מחזיק את הכסף
- **Location** — איפה הכסף נמצא פיזית
- **Settlement Availability** — ייתכן שישתנה (לא-זמין → זמין, כאשר אנסטסיה מעבירה לJJ)

עסקת Transfer **לעולם לא** משנה:
- הכנסה
- הוצאה
- רווח
- הפסד

**כלל חוקתי רוחבי — תקף לכל מנוע ב-JJ:**

| מנוע | כלל |
|------|-----|
| Import Pipeline | Transfer rows אינן מסווגות כ-income/expense |
| Banking Integration | העברת כסף בין חשבונות JJ אינה P&L |
| AI Agents | אסור להסיק רווח/הפסד מ-Transfer |
| Reconciliation | Transfer מזוהה כשינוי מיקום — לא כאירוע כלכלי |
| Settlement Engine | Transfer משנה Settlement Availability — לא את היתרה הכלכלית |

**כלל מחייב:** כל מנוע שמקבל שורות transactions חייב לזהות `category='Transfer'` ולטפל בה כשינוי מיקום/משמורת בלבד. כל מנוע שמסווג Transfer כהכנסה או הוצאה — שגוי.

**מקור:** ADR-P2-006 (PQ-3 decision), שיחת יוסי 29 יולי 2026.

---

### P-LEDGER-6 — Owner-Facing Amount Basis (אושר 31 יולי 2026)

> **Owner liabilities are calculated using the owner's billed amount (`client_charge`) when present; otherwise the recorded transaction amount (`amount_eur`).**

**נוסחה קנונית:**
```sql
COALESCE(client_charge, amount_eur)
```

**שני המספרים:**

| שדה | מה הוא מייצג | מתי הם שונים |
|-----|-------------|-------------|
| `amount_eur` | הסכום שעבר בפועל (Cash Reality) | תמיד קיים |
| `client_charge` | הסכום שחויב לבעלים/לקוח (Billed Amount) | כאשר JJ גובה מחיר שונה מהעלות בפועל |

**הכלל:**

כאשר JJ מחשבת כמה בעלים חייב או זכאי — הסכום הרלוונטי הוא **מה שחויב** (`client_charge`), לא מה ששולם בפועל (`amount_eur`). כאשר `client_charge` = NULL, הסכום שחויב שווה לסכום ששולם.

**דוגמה מוכחת (FPE L2, Villa Mazotos, AV-1):**
- שימוש ב-`amount_eur` בלבד → הוצאות €13,574.62
- שימוש ב-`COALESCE(client_charge, amount_eur)` → הוצאות €14,828.29
- דלתא = €1,253.67, שנובעת משורות שבהן `client_charge ≠ amount_eur`
- AV-1 אימות עסקי → €14,828.29 הוא הנכון

**מה זה לא:**
- לא כלל לחישוב תזרים מזומנים (Cash Position = L1, שם `amount_eur` הוא הסמכותי)
- לא כלל לחישוב הון שותפים (Partner Capital = שכבה עתידית, כללים ייקבעו)
- לא כלל ליבוא נתונים (Import = Cash Reality, שומר על שני השדות)

**תחולה:**

| מנוע / שכבה | כלל Amount |
|-------------|-----------|
| FPE L1 — Cash Position | `amount_eur` (Cash Reality) |
| FPE L2 — Owner Liabilities | `COALESCE(client_charge, amount_eur)` ← **P-LEDGER-6** |
| RC3 — Client Report | `COALESCE(client_charge, amount_eur)` ← **P-LEDGER-6** |
| Settlement Engine (עתידי) | ייקבע — ייתכן הפרדה בין שכבות |
| Import Pipeline | שומר את שני השדות כפי שהם — לא מחליף |

**כלל מחייב:** כל מנוע שמחשב יתרת בעלים, חיוב לקוח, או כל סכום owner-facing חייב להשתמש ב-`COALESCE(client_charge, amount_eur)`. שימוש ב-`amount_eur` בלבד לחישוב owner-facing הוא שגיאה.

**מקור:** FPE L2 Engineering Sprint 2, אימות AV-1, אושר ע"י יוסי 31 יולי 2026.

---

### D4 — JJ Entity Settlement Model (אושר 27 יולי 2026)

**החלטה עסקית מאושרת:** JJ היא גבול ההתחשבנות התפעולי הקבוע של המערכת.

**Two-Layer Settlement Model:**

```
Layer 1 — JJ ↔ World

  External Party ↔ JJ

  Examples:
    Anastasia ↔ JJ
    Supplier   ↔ JJ
    Customer   ↔ JJ
    Owner      ↔ JJ
    Contractor ↔ JJ

  Every operational balance exists only against JJ.
  Never against individual partners.

Layer 2 — JJ ↔ Partners

  Partner ↔ JJ

  Examples:
    Yossi          ↔ JJ
    Jacob          ↔ JJ
    Future partner ↔ JJ

  Partner balances are derived from JJ.
  Never derived directly from employees, suppliers, or customers.
```

**Constitutional Rule:**
> Partners do not settle with employees.  
> Partners settle with the company.  
> The company settles with the world.

**Architectural Consequence:**
- Employees are never counterparties to partner settlements.
- Suppliers are never counterparties to partner settlements.
- Customers are never counterparties to partner settlements.
- Every external relationship terminates at JJ.
- Partner balances begin at JJ.

**כלל מחייב:** כל Ledger Engine, כל Settlement Engine, כל Reporting Engine, וכל Dashboard חייבים לכבד את המבנה הזה. אסור לחשב יתרת שותף ישירות מול צד חיצוני. אין חריגים אלא אם מוגדרים במפורש בהסכם מחייב (governing agreement).

**Dashboard Architecture Targets (Track A — future implementation):**
- Dashboard A (JJ Operational Ledger): מציג את כל היחסים בין JJ לצדדים חיצוניים — JJ ↔ Anastasia, JJ ↔ Suppliers, JJ ↔ Customers, JJ ↔ Owners, JJ ↔ Contractors.
- Dashboard B (Partner Settlement Ledger): מציג את כל היחסים בין JJ לשותפים — JJ ↔ Yossi, JJ ↔ Jacob, כולל: כל נכס, כל העברה, כל הכנסת JJ, כל הוצאת JJ, כל הפקדת הון, כל התחשבנות. יתרה אחת רצה לכל שותף.

**Relationship to P-LEDGER-1:**
P-LEDGER-1 קבע: "Economic bearer is not automatically the Settlement Counterparty." D4 הוא ה-governing evidence ש-P-LEDGER-1 דרש: JJ היא ה-Settlement Counterparty — תמיד. לצדדים חיצוניים בLayer 1, ולשותפים בLayer 2.

---

### הקשר לעקרונות קיימים

| עיקרון | מקור | קשר ל-P-LEDGER |
|--------|------|---------------|
| P-ARCH-1: Unknown = NULL | M8 | P-LEDGER-1 מרחיב: Economic bearer unknown = NULL (לא Anastasia) |
| P-ARCH-2: Yossi ≠ Jacob ≠ JJ | M8 | P-LEDGER-1: Settlement Counterparty מחייב שמירת זהות השותף |
| P-ARCH-8: JHKA הוא מקור האמת | ADR-001 | P-LEDGER-2: Qualification דורשת ראיה — JHKA מספק אותה |
| Evidence before certainty | — | P-LEDGER-2: "by qualification" = "by evidence" |
| Composition may aggregate; never replace | G3-C | P-LEDGER-1: Settlement chain יכולה לעבור דרך JJ; אינה מחליפה את ה-direct obligation |
| P-EVIDENCE-1: חקירה מתחילה משאלה עסקית | AV-005 | P-LEDGER-3: Entry condition → שאלה עסקית חייבת להיות מוגדרת לפני PASS 0 |
| Wrong Scope > Wrong Fact | AV-005 Phase 1 | P-LEDGER-3: גבולות הסקופ הם ההגנה העיקרית — לא אימות מספרים |
| D4: JJ Entity Settlement Model | AV-005 + בשלות עסקית | P-LEDGER-1: D4 מספק את ה-governing evidence — JJ היא ה-Settlement Counterparty תמיד |
| Entity balances remain separate | ADR-P2-006 PQ-2 | P-LEDGER-4: אחוזי בעלות לא יוצרים זכאות ללא Approved Distribution מפורש |
| Approved Distribution reduces availability | ADR-P2-006 F2 | P-LEDGER-4: כסף שאושר להפצה אינו Settlement Available — גם לפני תשלום |
| Transfer = custody change only | ADR-P2-006 PQ-3 | P-LEDGER-5: Transfer אינו אירוע כלכלי — אסור לסווג כ-income/expense |
| Billed amount ≠ cash amount | FPE L2 / AV-1 | P-LEDGER-6: owner-facing calculations use COALESCE(client_charge, amount_eur) — not amount_eur alone |
