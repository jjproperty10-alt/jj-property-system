"""
JJ Property 10 — Data Import Script
Cleans and imports General.xlsx into Supabase

Usage:
    pip install openpyxl supabase python-dotenv
    python import_data.py

Set environment variables in .env:
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=your-service-role-key
    EXCEL_PATH=path/to/General.xlsx
"""

import os
import sys
import re
from datetime import datetime
from dotenv import load_dotenv
import openpyxl
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
EXCEL_PATH = os.getenv("EXCEL_PATH", "General.xlsx")

# ============================================================
# NORMALIZATION MAPS
# ============================================================

# Canonical property names
PROPERTY_MAP = {
    # Case fixes
    "uriel kokkines":                    "Uriel Kokkines",
    "uriel kamares":                     "Uriel Kamares",
    "uriel kamares ":                    "Uriel Kamares",
    "ilan&ilana mazotos":                "Ilan&Ilana Mazotos",
    " ilan&ilana mazotos":               "Ilan&Ilana Mazotos",
    "ilan&ilana mazotos ":               "Ilan&Ilana Mazotos",
    "villa mazotos":                     "Villa Mazotos",
    "villa mazotos royal":               "Villa Mazotos",
    "jj ground floor dekeleia":          "JJ Ground Floor Dekeleia",
    "jj ground floor dekeleia ":         "JJ Ground Floor Dekeleia",
    "uriel oroklini 2 bed":              "Uriel Oroklini 2 Bed",
    "tom dekelia":                       "Tom Dekelia",
    "apartment neer yoav dekelia":       "Apartment Neer Yoav Dekelia",
    "tamir kiti":                        "Tamir Kiti",
    "tamir kiti ":                       "Tamir Kiti",
    "tamir kiti 1":                      "Tamir Kiti 1",
    "tamir kiti 2":                      "Tamir Kiti 2",
    "liron and alon ":                   "Liron and Alon",
    "liron and alon":                    "Liron and Alon",
    "liron and alon 1":                  "Liron and Alon 1",
    "tamir redisson ":                   "Tamir Redisson",
    "tamir redisson":                    "Tamir Redisson",
    "ofri makarios 5 floor":             "Ofri Makarios 5 Floor",
    "ofri makarios":                     "Ofri Makarios 5 Floor",
    "uriel duplex":                      "Uriel Duplex",
    "urial dublex":                      "Uriel Duplex",
    "sharon kiti ":                      "Sharon Kiti",
    "sharon kiti":                       "Sharon Kiti",
    "liora anafotia 202":                "Liora Anafotia 202",
    "liora anafotia 201":                "Liora Anafotia 202",  # likely same property
    "oshrit deklia":                     "Oshrit Deklia",
    "oshrit deklia ":                    "Oshrit Deklia",
    "yossi house":                       "Oshrit Deklia",
    "roni panthouse tersefanou":         "Roni Penthouse Tersefanou",
    "roni panthouse tersefanou ":        "Roni Penthouse Tersefanou",
    "ben zvi tersefanou":                "Ben Zvi Tersefanou",
    "oren kitty":                        "Oren Kitty",
    "oren aradipou":                     "Oren Aradipou",
    "oren aradipou ":                    "Oren Aradipou",
    "yogev port":                        "Yogev Port",
    "yogev port ":                       "Yogev Port",
    "jj trespano magda":                 "JJ Trespano Magda",
    "jj trespano magda ":                "JJ Trespano Magda",
    "efi dekelia":                       "Efi Dekelia",
    "uriel studio kitty":                "Uriel Studio Kitty",
    "uriel debenhams":                   "Uriel Debenhams",
    "uriel sharon english metro":        "Uriel Sharon English Metro",
    "miranta radisson":                  "Miranta Radisson",
    "orit rob pingodes":                 "Orit Rob Pingodes",
    "jacob house":                       "Jacob House",
    "jj andreas ground floor apartment dheklia": "JJ Ground Floor Dekeleia",
    # JJ general
    "jj airbnb":                         None,  # → no property, JJ category
    "jj":                                None,
    # Invalid / unallocated
    "faby":                              None,
    "cleaner":                           None,
    "office":                            None,
    "storage":                           None,
    "לבדוק לי מי זה שייך":              None,
    "jacob oroklini":                    "Jacob House",
    "villa mazotos 2":                   "Villa Mazotos 2",
}

# Canonical payer names
PAYER_MAP = {
    "yossi":     "Yossi",
    "jacob":     "Jacob",
    "yaacov":    "Jacob",
    "jj":        "JJ",
    "anastasia": "Anastasia",
    "tenant":    "Tenant",
    "client":    "Client",
    "owner":     "Owner",
    "onwer":     "Owner",
    "airbmb":    "Airbnb",
    "airbnb":    "Airbnb",
    "atm":       "ATM",
    "compani":   "Company",
    "company":   "Company",
    "alon":      "Alon",
    "liron":     "Liron",
    "yogeev":    "Yogev",
    "avi":       "Avi",
}

# Canonical payee names
PAYEE_MAP = {
    "company":      "Company",
    "compani":      "Company",
    "anastasia":    "Anastasia",
    "jacob":        "Jacob",
    "jj":           "JJ",
    "owner":        "Owner",
    "woner":        "Owner",
    "yossi":        "Yossi",
    "david":        "David",
    "yanis":        "Yanis",
    "fabi":         "Fabi",
    "faby":         "Fabi",
    "german":       "German",
    "garman":       "German",
    "yasin":        "Yasin",
    "photographer": "Photographer",
    "photografer":  "Photographer",
    "savva":        "Savva",
    "copy":         "Copy",
    "dominik":      "Dominik",
    "suply":        "Supply",
    "suplay":       "Supply",
    "bunos":        "Bonus",
    "andras":       "Andras",
    "tenant":       "Tenant",
    "cliant":       "Client",
    "claint":       "Client",
    "client":       "Client",
    "magda":        "Magda",
    "printing":     "Printing",
    "nikos":        "Nikos",
    "decoration":   "Decoration",
    "jumbo":        "Jumbo",
    "removel":      "Removal",
    "lighting":     "Lighting",
    "liron":        "Liron",
}

# Canonical subcategory names
SUBCATEGORY_MAP = {
    "salary ansatasia":                  "Salary Anastasia",
    "salary fabi":                       "Salary Fabi",
    "pool servis":                       "Pool Service",
    "airbnb":                            "Airbnb Operations",
    "bazaraki":                          "Bazaraki",
    "cleaning supplies":                 "Cleaning Supplies",
    " cleaning supplies":                "Cleaning Supplies",
    "electricity bill":                  "Electricity Bill",
    "water bill":                        "Water",
    "alouminiom":                        "Aluminium",
    "keramik":                           "Ceramic",
    "bed shits":                         "Bedding / Pillows / Blankets",
    "bedding / pillows / blankets":      "Bedding / Pillows / Blankets",
    "kitchen suply":                     "Kitchen Supplies",
    "consumable supplies":               "Consumable Supplies",
    "guest service expenses":            "Guest Supplies",
    "transport / removal":               "Transport / Removal",
    "other":                             "Other",
    "cleaning":                          "Cleaning",
    "repairs":                           "Repairs",
    "plumber":                           "Plumber",
    "water":                             "Water",
    "internet":                          "Internet",
    "furniture":                         "Furniture",
    "design fee":                        "Design Fee",
    "renovation":                        "Other",
    "jj expense coverage":               "Other",
}

# ============================================================
# NORMALIZE FUNCTIONS
# ============================================================

def normalize(value, mapping):
    if not value:
        return None
    key = str(value).strip().lower()
    return mapping.get(key, str(value).strip())

def normalize_property(value):
    if not value:
        return None
    key = str(value).strip().lower()
    if key in PROPERTY_MAP:
        return PROPERTY_MAP[key]  # May be None for invalid
    # Title-case fallback
    return str(value).strip()

def normalize_payer(value):
    return normalize(value, PAYER_MAP)

def normalize_payee(value):
    return normalize(value, PAYEE_MAP)

def normalize_subcategory(value):
    if not value:
        return "Other"
    key = str(value).strip().lower()
    return SUBCATEGORY_MAP.get(key, str(value).strip())

def normalize_category(value):
    if not value:
        return "JJ"
    return str(value).strip()

def parse_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, str):
        for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y'):
            try:
                return datetime.strptime(value, fmt).date().isoformat()
            except ValueError:
                continue
    return None

def safe_decimal(value):
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None

# ============================================================
# PROPERTIES LIST (from שמות הנכסים tab)
# ============================================================
PROPERTIES_FROM_SHEET = [
    {"name": "Tom Dekelia",                         "nickname": "Yossi 1",           "status": "Airbnb"},
    {"name": "Uriel Duplex",                        "nickname": "Duplex",            "status": "Airbnb"},
    {"name": "Tamir Dekelia",                       "nickname": "SeaView",           "status": "Airbnb"},
    {"name": "Apartment Neer Yoav Dekelia",         "nickname": "Sunrise",           "status": "Airbnb",  "notes": "Efi Dekelia"},
    {"name": "Ofri Makarios 5 Floor",               "nickname": "SkyView",           "status": "Airbnb"},
    {"name": "Tamir Redisson",                      "nickname": "Radisson City",     "status": "Airbnb"},
    {"name": "Villa Mazotos",                       "nickname": None,                "status": "Airbnb"},
    {"name": "Oren Kitty",                          "nickname": "Kiti Escape House", "status": "Airbnb"},
    {"name": "Yogev Port",                          "nickname": None,                "status": "Airbnb"},
    {"name": "Oren Aradipou",                       "nickname": None,                "status": "Rent"},
    {"name": "Jacob House",                         "nickname": None,                "status": "Sale"},
    {"name": "Liron and Alon",                      "nickname": "Larnaca Apartment", "status": "Rent"},
    {"name": "Liron and Alon 1",                    "nickname": None,                "status": "Rent"},
    {"name": "Liora Anafotia 202",                  "nickname": None,                "status": "Rent"},
    {"name": "Uriel Kokkines",                      "nickname": None,                "status": "Rent"},
    {"name": "Uriel Oroklini 2 Bed",                "nickname": None,                "status": "Rent&Sale"},
    {"name": "Uriel Debenhams",                     "nickname": None,                "status": "Sale"},
    {"name": "Uriel Sharon English Metro",          "nickname": None,                "status": "Rent&Sale"},
    {"name": "Uriel Studio Kitty",                  "nickname": None,                "status": "Rent&Sale"},
    {"name": "Ben Zvi Tersefanou",                  "nickname": "Ground Floor",      "status": "Rent&Sale"},
    {"name": "Ilan&Ilana Mazotos",                  "nickname": None,                "status": "Rent&Sale"},
    {"name": "Oshrit Deklia",                       "nickname": "Yossi House",       "status": "Rent"},
    {"name": "Roni Penthouse Tersefanou",           "nickname": None,                "status": "Rent"},
    {"name": "Tamir Kiti 1",                        "nickname": None,                "status": "Rent"},
    {"name": "Tamir Kiti 2",                        "nickname": None,                "status": "Rent"},
    {"name": "Uriel Kamares",                       "nickname": None,                "status": "Rent"},
    {"name": "JJ Ground Floor Dekeleia",            "nickname": None,                "status": "Rent"},
    # Additional from data
    {"name": "Sharon Kiti",                         "nickname": None,                "status": "Rent&Sale"},
    {"name": "Tamir Kiti",                          "nickname": None,                "status": "Rent"},
    {"name": "JJ Trespano Magda",                   "nickname": None,                "status": "Sale"},
    {"name": "Efi Dekelia",                         "nickname": None,                "status": "Rent"},
    {"name": "Orit Rob Pingodes",                   "nickname": None,                "status": "Rent"},
    {"name": "Miranta Radisson",                    "nickname": None,                "status": "Airbnb"},
    {"name": "Villa Mazotos 2",                     "nickname": None,                "status": "Airbnb"},
]

# ============================================================
# MAIN IMPORT
# ============================================================

def main():
    print("=" * 60)
    print("JJ Property 10 — Data Import")
    print("=" * 60)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
        sys.exit(1)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # --------------------------------------------------------
    # STEP 1: Import properties
    # --------------------------------------------------------
    print("\n[1/3] Importing properties...")
    prop_name_to_id = {}

    for prop in PROPERTIES_FROM_SHEET:
        try:
            result = supabase.table("properties").upsert(
                prop,
                on_conflict="name"
            ).execute()
            if result.data:
                prop_name_to_id[prop["name"].lower()] = result.data[0]["id"]
                print(f"  ✓ {prop['name']}")
        except Exception as e:
            print(f"  ✗ {prop['name']}: {e}")

    # Refresh IDs
    all_props = supabase.table("properties").select("id,name").execute()
    for p in all_props.data:
        prop_name_to_id[p["name"].lower()] = p["id"]

    print(f"  → {len(prop_name_to_id)} properties imported")

    # --------------------------------------------------------
    # STEP 2: Read Excel
    # --------------------------------------------------------
    print(f"\n[2/3] Reading {EXCEL_PATH}...")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb["DATA"]
    rows = list(ws.iter_rows(values_only=True))
    data_rows = rows[1:]  # skip header
    print(f"  → {len(data_rows)} rows found")

    # --------------------------------------------------------
    # STEP 3: Clean & import transactions
    # --------------------------------------------------------
    print(f"\n[3/3] Importing transactions...")

    batch = []
    skipped = 0
    errors = []

    for i, row in enumerate(data_rows):
        date_val, prop_val, cat_val, subcat_val, desc_val, \
            payer_val, payee_val, amount_val, client_charge_val, notes_val = row[:10]

        k_note = row[10] if len(row) > 10 else None

        parsed_date = parse_date(date_val)
        if not parsed_date:
            skipped += 1
            continue

        amount = safe_decimal(amount_val) or 0.0
        client_charge = safe_decimal(client_charge_val)

        # Normalize property
        prop_name_raw = normalize_property(prop_val)
        prop_id = prop_name_to_id.get(prop_name_raw.lower()) if prop_name_raw else None

        transaction = {
            "date":          parsed_date,
            "property_id":   prop_id,
            "property_name": prop_name_raw,
            "category":      normalize_category(cat_val),
            "subcategory":   normalize_subcategory(subcat_val),
            "description":   str(desc_val).strip() if desc_val else None,
            "payer":         normalize_payer(payer_val),
            "payee":         normalize_payee(payee_val),
            "amount_eur":    amount,
            "client_charge": client_charge,
            "notes":         str(notes_val).strip() if notes_val else None,
            "k_note":        str(k_note).strip() if k_note else None,
        }

        batch.append(transaction)

        # Insert in batches of 100
        if len(batch) >= 100:
            try:
                supabase.table("transactions").insert(batch).execute()
                print(f"  → Inserted rows {i-99}–{i+1}")
                batch = []
            except Exception as e:
                errors.append(f"Batch ending row {i+1}: {e}")
                batch = []

    # Insert remaining
    if batch:
        try:
            supabase.table("transactions").insert(batch).execute()
            print(f"  → Inserted final {len(batch)} rows")
        except Exception as e:
            errors.append(f"Final batch: {e}")

    # --------------------------------------------------------
    # SUMMARY
    # --------------------------------------------------------
    print("\n" + "=" * 60)
    print("IMPORT COMPLETE")
    print(f"  Total rows:   {len(data_rows)}")
    print(f"  Skipped:      {skipped}")
    print(f"  Imported:     {len(data_rows) - skipped}")
    print(f"  Errors:       {len(errors)}")
    if errors:
        print("\nErrors:")
        for e in errors:
            print(f"  - {e}")
    print("=" * 60)


if __name__ == "__main__":
    main()
